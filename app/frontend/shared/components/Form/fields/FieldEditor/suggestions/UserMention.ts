// Copyright (C) 2012-2023 Zammad Foundation, https://zammad-foundation.org/

import Mention from '@tiptap/extension-mention'
import Link from '@tiptap/extension-link'
import type { Ref } from 'vue'
import type { FormFieldContext } from '@shared/components/Form/types/field'
import { QueryHandler } from '@shared/server/apollo/handler'
import {
  NotificationTypes,
  useNotifications,
} from '@shared/components/CommonNotifications'
import { ensureGraphqlId } from '@shared/graphql/utils'
import { debouncedQuery } from '@shared/utils/helpers'
import { getNodeByName } from '@shared/components/Form/utils'
import { useApplicationStore } from '@shared/stores/application'
import buildMentionSuggestion from './suggestions'
import type { FieldEditorProps, MentionUserItem } from '../types'
import { useMentionSuggestionsLazyQuery } from '../graphql/queries/mention/mentionSuggestions.api'

export const PLUGIN_NAME = 'mentionUser'
export const PLUGIN_LINK_NAME = 'mentionUserLink'
const ACTIVATOR = '@@'

export default (context: Ref<FormFieldContext<FieldEditorProps>>) => {
  const app = useApplicationStore()
  const queryMentionsHandler = new QueryHandler(
    useMentionSuggestionsLazyQuery({
      query: '',
      groupId: '',
    }),
  )

  const getUserMentions = async (query: string, group: string) => {
    const { data } = await queryMentionsHandler.query({
      variables: {
        query,
        groupId: ensureGraphqlId('Group', group),
      },
    })
    return data?.mentionSuggestions || []
  }

  return Mention.extend({
    name: PLUGIN_NAME,
    addCommands: () => ({
      openUserMention:
        () =>
        ({ chain }) =>
          chain().insertContent(` ${ACTIVATOR}`).run(),
    }),
  }).configure({
    suggestion: buildMentionSuggestion({
      activator: ACTIVATOR,
      type: 'user',
      insert(props: MentionUserItem) {
        const { fqdn, http_type: httpType } = app.config
        // app/assets/javascripts/app/lib/base/jquery.textmodule.js:705
        const origin = `${httpType}://${fqdn}`
        const href = `${origin}/#user/profile/${props.internalId}`
        const text = props.fullname || props.email || ''
        return [
          {
            type: 'text',
            text,
            marks: [
              {
                type: PLUGIN_LINK_NAME,
                attrs: {
                  href,
                  target: null,
                  'data-mention-user-id': props.internalId,
                },
              },
            ],
          },
        ]
      },
      items: debouncedQuery(async ({ query }) => {
        if (!query) {
          return []
        }
        let { groupId: group } = context.value
        if (!group) {
          const { meta, formId } = context.value
          const groupNodeName = meta?.[PLUGIN_NAME]?.groupNodeName
          if (groupNodeName) {
            const groupNode = getNodeByName(formId, groupNodeName)
            group = groupNode?.value as string
          }
        }
        if (!group) {
          const notifications = useNotifications()
          notifications.notify({
            id: 'mention-user-required-group',
            unique: true,
            message: __('Before you mention a user, please select a group.'),
            type: NotificationTypes.Warn,
          })
          return []
        }
        return getUserMentions(query, group)
      }, []),
    }),
  })
}

export const UserLink = Link.extend({
  name: PLUGIN_LINK_NAME,
  addAttributes() {
    return {
      ...this.parent?.(),
      href: {
        default: null,
      },
      'data-mention-user-id': {
        default: null,
        parseHTML: (element) => element.dataset.mentionUserId,
        renderHTML: (attributes) => ({
          'data-mention-user-id': attributes['data-mention-user-id'],
        }),
      },
    }
  },
}).configure({
  openOnClick: false,
  autolink: false,
})
