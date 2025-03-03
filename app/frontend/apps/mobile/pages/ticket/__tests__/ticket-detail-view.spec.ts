// Copyright (C) 2012-2023 Zammad Foundation, https://zammad-foundation.org/

const now = new Date(2022, 1, 1, 0, 0, 0, 0)
vi.setSystemTime(now)

import { getNode } from '@formkit/core'
import { ApolloError } from '@apollo/client/errors'
import { TicketArticleRetrySecurityProcessDocument } from '@shared/entities/ticket-article/graphql/mutations/ticketArticleRetrySecurityProcess.api'
import type { TicketArticleRetrySecurityProcessMutation } from '@shared/graphql/types'
import { convertToGraphQLId } from '@shared/graphql/utils'
import { mockOnlineNotificationSeenGql } from '@shared/composables/__tests__/mocks/online-notification'
import { getAllByTestId, getByLabelText, getByRole } from '@testing-library/vue'
import { getByIconName } from '@tests/support/components/iconQueries'
import { getTestRouter } from '@tests/support/components/renderComponent'
import { visitView } from '@tests/support/components/visitView'
import createMockClient from '@tests/support/mock-apollo-client'
import { mockAccount } from '@tests/support/mock-account'
import { mockApplicationConfig } from '@tests/support/mock-applicationConfig'
import {
  mockGraphQLApi,
  mockGraphQLSubscription,
} from '@tests/support/mock-graphql-api'
import { mockPermissions } from '@tests/support/mock-permissions'
import { nullableMock, waitUntil } from '@tests/support/utils'
import { flushPromises } from '@vue/test-utils'
import { TicketDocument } from '../graphql/queries/ticket.api'
import { TicketArticlesDocument } from '../graphql/queries/ticket/articles.api'
import { TicketArticleUpdatesDocument } from '../graphql/subscriptions/ticketArticlesUpdates.api'
import { TicketUpdatesDocument } from '../graphql/subscriptions/ticketUpdates.api'
import {
  defaultArticles,
  defaultTicket,
  mockTicketDetailViewGql,
  mockTicketLiveUsersGql,
} from './mocks/detail-view'
import { mockArticleQuery } from './mocks/articles'

beforeEach(() => {
  mockPermissions(['ticket.agent'])
})

test('statics inside ticket zoom view', async () => {
  const { waitUntilTicketLoaded } = mockTicketDetailViewGql()

  const view = await visitView('/tickets/1')

  expect(view.getByTestId('loader-list')).toBeInTheDocument()
  expect(view.getByTestId('loader-title')).toBeInTheDocument()
  expect(view.getByTestId('loader-header')).toBeInTheDocument()

  await waitUntilTicketLoaded()

  const header = view.getByTestId('header-content')

  expect(header).toHaveTextContent('#610001')
  expect(header).toHaveTextContent('created 3 days ago')

  const titleElement = view.getByTestId('title-content')

  expect(titleElement).toHaveTextContent('Test Ticket View')
  expect(titleElement).toHaveTextContent('escalation 2 days ago')
  expect(titleElement, 'has customer avatar').toHaveTextContent('JD')

  const articlesElement = view.getByRole('group', { name: 'Articles' })

  const times = getAllByTestId(articlesElement, 'date-time-absolute')

  expect(times).toHaveLength(2)
  expect(times[0]).toHaveTextContent('2022-01-29')
  expect(times[1]).toHaveTextContent('2022-01-30')

  const comments = view.getAllByRole('comment')

  // everything else for article is testes inside ArticleBubble
  expect(comments).toHaveLength(3)

  // customer article
  expect(comments[0]).toHaveClass('flex-row-reverse')
  expect(comments[0]).toHaveTextContent('John')
  expect(comments[0]).toHaveTextContent('Body of a test ticket')

  // agent public comment
  expect(comments[1]).not.toHaveClass('flex-row-reverse')
  expect(comments[1]).toHaveTextContent('Albert')
  expect(comments[1]).toHaveTextContent('energy equals power times time')

  // agent internal comment
  expect(comments[2]).not.toHaveClass('flex-row-reverse')
  expect(comments[2]).toHaveTextContent('Monkey')
  expect(comments[2]).toHaveTextContent('only agents can see this haha')

  expect(view.getByRole('button', { name: 'Add reply' })).toBeInTheDocument()

  expect(
    view.queryByText('not-visible-attachment.png'),
    'filters original-format attachments',
  ).not.toBeInTheDocument()
})

describe('user avatars', () => {
  it('renders customer avatar, when user is inactive', async () => {
    const ticket = defaultTicket()
    const image = Buffer.from('max.png').toString('base64')
    const { customer } = ticket.ticket
    customer.active = false
    customer.image = image
    const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
      ticket,
    })

    const view = await visitView('/tickets/1')
    await waitUntilTicketLoaded()

    const titleBlock = view.getByTestId('ticket-title')
    const avatar = getByRole(titleBlock, 'img', {
      name: `Avatar (${customer.fullname})`,
    })

    expect(avatar).toBeAvatarElement({
      active: false,
      image,
      type: 'user',
    })
  })

  it('renders article user image when he is inactive', async () => {
    const articles = defaultArticles()
    const { author } = articles.description.edges[0].node
    author.active = false
    author.image = 'avatar.png'
    author.firstname = 'Max'
    author.lastname = 'Mustermann'
    author.fullname = 'Max Mustermann'
    const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
      articles,
    })

    const view = await visitView('/tickets/1')
    await waitUntilTicketLoaded()

    expect(
      view.getByRole('img', { name: `Avatar (${author.fullname})` }),
    ).toBeAvatarElement({
      type: 'user',
      image: 'avatar.png',
      outOfOffice: false,
      vip: false,
      active: false,
    })
  })

  it('renders article user when he is out of office', async () => {
    const articles = defaultArticles()
    const { author } = articles.description.edges[0].node
    author.outOfOffice = true
    author.active = true
    author.vip = true
    author.firstname = 'Max'
    author.lastname = 'Mustermann'
    author.fullname = 'Max Mustermann'
    const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
      articles,
    })

    const view = await visitView('/tickets/1')
    await waitUntilTicketLoaded()

    expect(
      view.getByRole('img', { name: `Avatar (${author.fullname}) (VIP)` }),
    ).toBeAvatarElement({
      type: 'user',
      outOfOffice: true,
      vip: true,
      active: true,
    })
  })
})

test("redirects to error page, if can't find ticket", async () => {
  const { calls } = mockGraphQLApi(TicketDocument).willFailWithNotFoundError(
    'The ticket 9866 could not be found',
  )
  mockGraphQLApi(TicketArticlesDocument).willFailWithNotFoundError(
    'The ticket 9866 could not be found',
  )
  mockGraphQLSubscription(TicketUpdatesDocument).error(
    new ApolloError({ errorMessage: "Couldn't find Ticket with 'id'=9866" }),
  )
  mockGraphQLSubscription(TicketArticleUpdatesDocument).error(
    new ApolloError({ errorMessage: "Couldn't find Ticket with 'id'=9866" }),
  )

  await visitView('/tickets/9866')

  await waitUntil(() => calls.error > 0)
  await flushPromises()

  const router = getTestRouter()
  expect(router.replace).toHaveBeenCalledWith({
    name: 'Error',
    query: {
      redirect: '1',
    },
  })
})

test('show article context on click', async () => {
  const { waitUntilTicketLoaded } = mockTicketDetailViewGql()

  const view = await visitView('/tickets/1')

  await waitUntilTicketLoaded()

  vi.useRealTimers()

  const contextTriggers = view.getAllByRole('button', {
    name: 'Article actions',
  })

  expect(contextTriggers).toHaveLength(3)

  await view.events.click(contextTriggers[0])

  expect(view.getByText('Set to internal')).toBeInTheDocument()
})

test('change content on subscription', async () => {
  const { waitUntilTicketLoaded, mockTicketSubscription, ticket } =
    mockTicketDetailViewGql()

  const view = await visitView('/tickets/1')

  await waitUntilTicketLoaded()

  expect(view.getByText(ticket.title)).toBeInTheDocument()

  await mockTicketSubscription.next({
    data: {
      ticketUpdates: {
        __typename: 'TicketUpdatesPayload',
        ticket: nullableMock({ ...ticket, title: 'Some New Title' }),
        ticketArticle: null,
      },
    },
  })

  expect(view.getByText('Some New Title')).toBeInTheDocument()
})

test('can load more articles', async () => {
  mockApplicationConfig({
    ticket_articles_min: 1,
  })

  const { description, articles } = defaultArticles()

  const [article1, article2] = articles.edges

  const articlesHandler = vi.fn(async (variables: any) => {
    if (!variables.loadDescription) {
      return {
        data: {
          description: null,
          articles: {
            __typename: 'TicketArticleConnection',
            totalCount: 3,
            edges: [article2],
            pageInfo: {
              __typename: 'PageInfo',
              hasPreviousPage: false,
              startCursor: '',
              endCursor: '',
            },
          },
        },
      }
    }
    return {
      data: {
        description,
        articles: {
          __typename: 'TicketArticleConnection',
          totalCount: 3,
          edges: [article1],
          pageInfo: {
            __typename: 'PageInfo',
            hasPreviousPage: true,
            startCursor: article1.cursor,
            endCursor: '',
          },
        },
      },
    }
  })

  mockTicketLiveUsersGql()
  mockOnlineNotificationSeenGql()

  mockGraphQLApi(TicketDocument).willResolve(defaultTicket())
  mockGraphQLSubscription(TicketUpdatesDocument)
  mockGraphQLSubscription(TicketArticleUpdatesDocument)
  createMockClient([
    {
      operationDocument: TicketArticlesDocument,
      handler: articlesHandler,
    },
  ])

  const view = await visitView('/tickets/1')

  const comments = await view.findAllByRole('comment')

  expect(comments).toHaveLength(2)

  vi.useRealTimers()

  await view.events.click(view.getByText('load 1 more'))

  expect(view.getAllByRole('comment')).toHaveLength(3)
})

describe('calling API to retry encryption', () => {
  it('updates ticket description', async () => {
    const articlesQuery = defaultArticles()
    const article = articlesQuery.description.edges[0].node
    article.securityState = {
      __typename: 'TicketArticleSecurityState',
      encryptionMessage: '',
      encryptionSuccess: false,
      signingMessage: 'Certificate for verification could not be found.',
      signingSuccess: false,
    }

    const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
      articles: articlesQuery,
    })

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    const securityError = view.getByRole('button', { name: 'Security Error' })
    await view.events.click(securityError)

    const retryResult = {
      __typename: 'TicketArticleSecurityState',
      encryptionMessage: '',
      encryptionSuccess: false,
      signingMessage:
        '/emailAddress=smime1@example.com/C=DE/ST=Berlin/L=Berlin/O=Example Security/OU=IT Department/CN=example.com',
      signingSuccess: true,
      type: 'S/MIME',
    } as const

    const mutation = mockGraphQLApi(
      TicketArticleRetrySecurityProcessDocument,
    ).willResolve<TicketArticleRetrySecurityProcessMutation>({
      ticketArticleRetrySecurityProcess: {
        __typename: 'TicketArticleRetrySecurityProcessPayload',
        retryResult,
        article: {
          __typename: 'TicketArticle',
          id: article.id,
          securityState: { ...retryResult },
        },
        errors: null,
      },
    })

    await view.events.click(view.getByRole('button', { name: 'Try again' }))

    expect(mutation.spies.resolve).toHaveBeenCalled()

    expect(view.queryByTestId('popupWindow')).not.toBeInTheDocument()

    const [articlesElement] = view.getAllByRole('comment')

    expect(getByLabelText(articlesElement, 'Signed')).toBeInTheDocument()
    expect(getByIconName(articlesElement, 'mobile-signed')).toBeInTheDocument()
  })

  it('updates non-description article', async () => {
    const articlesQuery = defaultArticles()
    const article = articlesQuery.articles.edges[0].node
    article.securityState = {
      __typename: 'TicketArticleSecurityState',
      encryptionMessage: '',
      encryptionSuccess: false,
      signingMessage: 'Certificate for verification could not be found.',
      signingSuccess: false,
    }

    const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
      articles: articlesQuery,
    })

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    const securityError = view.getByRole('button', { name: 'Security Error' })
    await view.events.click(securityError)

    const retryResult = {
      __typename: 'TicketArticleSecurityState',
      encryptionMessage: '',
      encryptionSuccess: false,
      signingMessage:
        '/emailAddress=smime1@example.com/C=DE/ST=Berlin/L=Berlin/O=Example Security/OU=IT Department/CN=example.com',
      signingSuccess: true,
      type: 'S/MIME',
    } as const

    const mutation = mockGraphQLApi(
      TicketArticleRetrySecurityProcessDocument,
    ).willResolve<TicketArticleRetrySecurityProcessMutation>({
      ticketArticleRetrySecurityProcess: {
        __typename: 'TicketArticleRetrySecurityProcessPayload',
        retryResult,
        article: {
          __typename: 'TicketArticle',
          id: article.id,
          securityState: { ...retryResult },
        },
        errors: null,
      },
    })

    await view.events.click(view.getByRole('button', { name: 'Try again' }))

    expect(mutation.spies.resolve).toHaveBeenCalled()

    expect(view.queryByTestId('popupWindow')).not.toBeInTheDocument()

    const [, firstCommentArticle] = view.getAllByRole('comment')

    expect(getByLabelText(firstCommentArticle, 'Signed')).toBeInTheDocument()
    expect(
      getByIconName(firstCommentArticle, 'mobile-signed'),
    ).toBeInTheDocument()
  })
})

describe('ticket viewers inside a ticket', () => {
  it('displays information with newer last interaction (and without own entry)', async () => {
    const { waitUntilTicketLoaded, mockTicketLiveUsersSubscription } =
      mockTicketDetailViewGql()

    mockAccount({
      lastname: 'Doe',
      firstname: 'John',
      fullname: 'John Doe',
      id: convertToGraphQLId('User', 4),
    })
    mockPermissions(['ticket.agent'])

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    await mockTicketLiveUsersSubscription.next({
      data: {
        ticketLiveUserUpdates: {
          liveUsers: [
            {
              user: {
                id: 'gid://zammad/User/4',
                firstname: 'Agent 1',
                lastname: 'Test',
                fullname: 'Agent 1 Test',
                __typename: 'User',
              },
              apps: [
                {
                  name: 'mobile',
                  editing: false,
                  lastInteraction: '2022-02-01T10:55:26Z',
                  __typename: 'TicketLiveUserApp',
                },
              ],
              __typename: 'TicketLiveUser',
            },
            {
              user: {
                id: 'gid://zammad/User/160',
                firstname: 'John',
                lastname: 'Doe',
                fullname: 'John Doe',
                __typename: 'User',
              },
              apps: [
                {
                  name: 'desktop',
                  editing: false,
                  lastInteraction: '2022-01-31T10:30:24Z',
                  __typename: 'TicketLiveUserApp',
                },
                {
                  name: 'mobile',
                  editing: false,
                  lastInteraction: '2022-01-31T16:45:53Z',
                  __typename: 'TicketLiveUserApp',
                },
              ],
              __typename: 'TicketLiveUser',
            },
            {
              user: {
                id: 'gid://zammad/User/165',
                firstname: 'Rose',
                lastname: 'Nylund',
                fullname: 'Rose Nylund',
                __typename: 'User',
              },
              apps: [
                {
                  name: 'mobile',
                  editing: false,
                  lastInteraction: '2022-01-31T16:45:53Z',
                  __typename: 'TicketLiveUserApp',
                },
              ],
              __typename: 'TicketLiveUser',
            },
          ],
          __typename: 'TicketLiveUserUpdatesPayload',
        },
      },
    })

    const counter = view.getByLabelText(/Ticket has 2 viewers/)

    expect(counter, 'has a counter').toBeInTheDocument()
    expect(counter).toHaveTextContent('+1')

    await view.events.click(
      view.getByRole('button', { name: 'Show ticket viewers' }),
    )

    await waitUntil(() =>
      view.queryByRole('dialog', { name: 'Ticket viewers' }),
    )

    expect(view.getByText('Opened in tabs')).toBeInTheDocument()
    expect(
      view.queryByRole('dialog', { name: 'Ticket viewers' }),
    ).toHaveTextContent('John Doe')
    expect(view.queryByIconName('mobile-desktop')).not.toBeInTheDocument()

    await mockTicketLiveUsersSubscription.next({
      data: {
        ticketLiveUserUpdates: {
          liveUsers: [
            {
              user: {
                id: 'gid://zammad/User/160',
                firstname: 'John',
                lastname: 'Doe',
                fullname: 'John Doe',
                __typename: 'User',
              },
              apps: [
                {
                  name: 'desktop',
                  editing: false,
                  lastInteraction: '2022-01-31T18:30:24Z',
                  __typename: 'TicketLiveUserApp',
                },
                {
                  name: 'mobile',
                  editing: false,
                  lastInteraction: '2022-01-31T16:45:53Z',
                  __typename: 'TicketLiveUserApp',
                },
              ],
              __typename: 'TicketLiveUser',
            },
          ],
          __typename: 'TicketLiveUserUpdatesPayload',
        },
      },
    })

    expect(view.queryByIconName('mobile-desktop')).toBeInTheDocument()
  })

  it('editing has always the highest priority', async () => {
    const { waitUntilTicketLoaded, mockTicketLiveUsersSubscription } =
      mockTicketDetailViewGql()

    mockAccount({
      lastname: 'Doe',
      firstname: 'John',
      fullname: 'John Doe',
      id: convertToGraphQLId('User', 4),
    })
    mockPermissions(['ticket.agent'])

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    await mockTicketLiveUsersSubscription.next({
      data: {
        ticketLiveUserUpdates: {
          liveUsers: [
            {
              user: {
                id: 'gid://zammad/User/160',
                firstname: 'John',
                lastname: 'Doe',
                fullname: 'John Doe',
                __typename: 'User',
              },
              apps: [
                {
                  name: 'desktop',
                  editing: true,
                  lastInteraction: '2022-01-31T10:30:24Z',
                  __typename: 'TicketLiveUserApp',
                },
                {
                  name: 'mobile',
                  editing: false,
                  lastInteraction: '2022-01-31T16:45:53Z',
                  __typename: 'TicketLiveUserApp',
                },
              ],
              __typename: 'TicketLiveUser',
            },
          ],
          __typename: 'TicketLiveUserUpdatesPayload',
        },
      },
    })

    await view.events.click(
      view.getByRole('button', { name: 'Show ticket viewers' }),
    )

    await waitUntil(() =>
      view.queryByRole('dialog', { name: 'Ticket viewers' }),
    )

    expect(
      view.queryByRole('dialog', { name: 'Ticket viewers' }),
    ).toHaveTextContent('John Doe')
    expect(view.queryByIconName('mobile-desktop-edit')).toBeInTheDocument()
  })

  it('show current user avatar when editing on other device', async () => {
    const { waitUntilTicketLoaded, mockTicketLiveUsersSubscription } =
      mockTicketDetailViewGql()

    mockAccount({
      lastname: 'Doe',
      firstname: 'John',
      fullname: 'John Doe',
      id: convertToGraphQLId('User', 4),
    })
    mockPermissions(['ticket.agent'])

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    await mockTicketLiveUsersSubscription.next({
      data: {
        ticketLiveUserUpdates: {
          liveUsers: [
            {
              user: {
                id: 'gid://zammad/User/4',
                firstname: 'Agent 1',
                lastname: 'Test',
                fullname: 'Agent 1 Test',
                __typename: 'User',
              },
              apps: [
                {
                  name: 'mobile',
                  editing: false,
                  lastInteraction: '2022-02-01T10:55:26Z',
                  __typename: 'TicketLiveUserApp',
                },
                {
                  name: 'desktop',
                  editing: true,
                  lastInteraction: '2022-02-01T09:55:26Z',
                  __typename: 'TicketLiveUserApp',
                },
              ],
              __typename: 'TicketLiveUser',
            },
          ],
          __typename: 'TicketLiveUserUpdatesPayload',
        },
      },
    })

    await view.events.click(
      view.getByRole('button', { name: 'Show ticket viewers' }),
    )

    await waitUntil(() =>
      view.queryByRole('dialog', { name: 'Ticket viewers' }),
    )

    expect(
      view.queryByRole('dialog', { name: 'Ticket viewers' }),
    ).toHaveTextContent('Agent 1 Test')
    expect(view.queryByIconName('mobile-desktop-edit')).toBeInTheDocument()
  })

  it('customer should only add live user entry but not subscribe', async () => {
    mockAccount({
      lastname: 'Braun',
      firstname: 'Nicole',
      fullname: 'Nicole Braun',
      id: convertToGraphQLId('User', 3),
    })

    const {
      waitUntilTicketLoaded,
      mockTicketLiveUserUpsert,
      mockTicketLiveUsersSubscription,
    } = mockTicketDetailViewGql({ ticketView: 'customer' })

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    await waitUntil(() => mockTicketLiveUserUpsert.calls.resolve === 1)

    await mockTicketLiveUsersSubscription.next({
      data: {
        ticketLiveUserUpdates: {
          liveUsers: [
            {
              user: {
                id: 'gid://zammad/User/160',
                firstname: 'John',
                lastname: 'Doe',
                fullname: 'John Doe',
                __typename: 'User',
              },
              apps: [
                {
                  name: 'desktop',
                  editing: false,
                  lastInteraction: '2022-01-31T18:30:24Z',
                  __typename: 'TicketLiveUserApp',
                },
                {
                  name: 'mobile',
                  editing: false,
                  lastInteraction: '2022-01-31T16:45:53Z',
                  __typename: 'TicketLiveUserApp',
                },
              ],
              __typename: 'TicketLiveUser',
            },
          ],
          __typename: 'TicketLiveUserUpdatesPayload',
        },
      },
    })

    expect(
      view.queryByRole('button', { name: 'Show ticket viewers' }),
    ).not.toBeInTheDocument()
  })
})

describe('ticket add/edit reply article', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('save button is not shown when select field is opened', async () => {
    const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
      mockFrontendObjectAttributes: true,
    })

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    await view.events.click(view.getByRole('button', { name: 'Add reply' }))

    await waitUntil(() => view.queryByRole('dialog', { name: 'Add reply' }))

    await view.events.type(view.getByLabelText('Text'), 'Testing')

    await expect(
      view.findByRole('button', { name: 'Save' }),
    ).resolves.toBeInTheDocument()

    await view.events.click(view.getByRole('combobox', { name: 'Visibility' }))

    expect(view.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()

    await view.events.click(view.getByRole('option', { name: 'Public' }))

    await expect(
      view.findByRole('button', { name: 'Save' }),
    ).resolves.toBeInTheDocument()
  })

  it('save button is not shown when non-reply dialog field is opened', async () => {
    const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
      mockFrontendObjectAttributes: true,
    })

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    await view.events.click(view.getByRole('button', { name: 'Add reply' }))

    await waitUntil(() => view.queryByRole('dialog', { name: 'Add reply' }))

    await view.events.type(view.getByLabelText('Text'), 'Testing')

    await expect(
      view.findByRole('button', { name: 'Save' }),
    ).resolves.toBeInTheDocument()

    await view.events.click(view.getByRole('button', { name: 'Done' }))

    expect(view.queryByText('You have unsaved changes.')).toBeInTheDocument()

    await view.events.click(
      view.getByRole('button', { name: 'Show ticket actions' }),
    )

    await waitUntil(() =>
      view.queryByRole('dialog', { name: 'Ticket actions' }),
    )

    expect(
      view.queryByText('You have unsaved changes.'),
    ).not.toBeInTheDocument()

    await view.events.click(view.getByText('Change customer'))

    await waitUntil(() =>
      view.queryByRole('dialog', { name: 'Change customer' }),
    )

    expect(
      view.queryByText('You have unsaved changes.'),
    ).not.toBeInTheDocument()
  })

  it('add reply (first time) should hold the form state after save button with an invalid state is used', async () => {
    const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
      mockFrontendObjectAttributes: true,
    })

    const view = await visitView('/tickets/1')

    await waitUntilTicketLoaded()

    const form = getNode('form-ticket-edit')

    await form?.settled

    form?.find('title', 'name')?.input('')

    await expect(
      view.findByLabelText('Validation failed'),
    ).resolves.toBeInTheDocument()

    await view.events.click(view.getByRole('button', { name: 'Add reply' }))

    await waitUntil(() => view.queryByRole('dialog', { name: 'Add reply' }))

    await getNode('form-ticket-edit')?.settled

    await view.events.type(view.getByLabelText('Text'), 'Testing')

    // Wait for form updater.
    await getNode('form-ticket-edit')?.settled

    await view.events.click(view.getByRole('button', { name: 'Save' }))

    expect(view.getByText('This field is required.')).toBeInTheDocument()

    expect(form?.find('body', 'name')?.value).toBe('Testing')
  })
})

it('correctly redirects from ticket hash-based routes', async () => {
  const { waitUntilTicketLoaded } = mockTicketDetailViewGql({
    ticketView: 'agent',
  })

  await visitView('/#ticket/zoom/1')
  await waitUntilTicketLoaded()

  const router = getTestRouter()
  const route = router.currentRoute.value

  expect(route.name).toBe('TicketDetailArticlesView')
  expect(route.params).toEqual({ internalId: '1' })
})

it("scrolls to the bottom the first time, but doesn't trigger rescroll on subsequent updates", async () => {
  const newArticlesQuery = mockArticleQuery(
    {
      internalId: 1,
      bodyWithUrls: '<p>Existing article> all can see this haha</p>',
    },
    [
      {
        internalId: 2,
        bodyWithUrls:
          '<p>Existing article switched to internal> all can see this haha</p>',
      },
      {
        internalId: 3,
        bodyWithUrls: '<p>Existing article> all can see this haha</p>',
      },
    ],
  )

  const newArticlesQueryAfterUpdate = mockArticleQuery(
    {
      internalId: 1,
      bodyWithUrls: '<p>Existing article> all can see this haha</p>',
    },
    [
      {
        internalId: 3,
        bodyWithUrls: '<p>Existing article> all can see this haha</p>',
      },
    ],
  )

  const { waitUntilTicketLoaded, mockTicketArticleSubscription } =
    mockTicketDetailViewGql({
      ticketView: 'agent',
      articles: [newArticlesQuery, newArticlesQueryAfterUpdate],
    })

  vi.spyOn(window, 'scrollTo').mockReturnValue()

  await visitView('/tickets/1')
  await waitUntilTicketLoaded()

  const router = getTestRouter()
  router.restoreMethods()

  expect(window.scrollTo).toHaveBeenCalledTimes(1)

  await mockTicketArticleSubscription.next(
    nullableMock({
      data: {
        ticketArticleUpdates: {
          addArticle: {
            __typename: 'TicketArticle',
            id: convertToGraphQLId('TicketArticle', 100),
            createdAt: new Date(2022, 0, 31, 0, 0, 0, 0).toISOString(),
          },
        },
      },
    }),
  )

  expect(window.scrollTo).toHaveBeenCalledTimes(1)
})
