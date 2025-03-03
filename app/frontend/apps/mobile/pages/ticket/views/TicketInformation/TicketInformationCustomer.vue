<!-- Copyright (C) 2012-2023 Zammad Foundation, https://zammad-foundation.org/ -->

<script setup lang="ts">
import { useUserDetail } from '@mobile/entities/user/composables/useUserDetail'
import { useUserEdit } from '@mobile/entities/user/composables/useUserEdit'
import { useUsersTicketsCount } from '@mobile/entities/user/composables/useUserTicketsCount'
import { watchEffect, computed } from 'vue'
import CommonTicketStateList from '@mobile/components/CommonTicketStateList/CommonTicketStateList.vue'
import ObjectAttributes from '@shared/components/ObjectAttributes/ObjectAttributes.vue'
import CommonButton from '@mobile/components/CommonButton/CommonButton.vue'
import CommonLoader from '@mobile/components/CommonLoader/CommonLoader.vue'
import CommonUserAvatar from '@shared/components/CommonUserAvatar/CommonUserAvatar.vue'
import CommonOrganizationsList from '@mobile/components/CommonOrganizationsList/CommonOrganizationsList.vue'
import { normalizeEdges } from '@shared/utils/helpers'
import { useTicketInformation } from '../../composable/useTicketInformation'

interface Props {
  internalId: number
}

defineProps<Props>()

const { ticket, updateRefetchingStatus } = useTicketInformation()

const {
  user,
  loading,
  objectAttributes,
  loadUser,
  loadAllSecondaryOrganizations,
} = useUserDetail()

watchEffect(() => {
  if (ticket.value) {
    loadUser(ticket.value.customer.internalId)
  }
})

watchEffect(() => {
  updateRefetchingStatus(loading.value && user.value != null)
})

const { openEditUserDialog } = useUserEdit()

const { getTicketData } = useUsersTicketsCount()
const ticketsData = computed(() => getTicketData(user.value))

const secondaryOrganizations = computed(() =>
  normalizeEdges(user.value?.secondaryOrganizations),
)
</script>

<template>
  <CommonLoader :loading="loading && !user">
    <div v-if="user" class="mb-3 flex items-center gap-3">
      <CommonUserAvatar aria-hidden="true" size="normal" :entity="user" />
      <div>
        <h2 class="text-lg font-semibold">
          {{ user.fullname }}
        </h2>
        <h3 v-if="user.organization">
          <CommonLink
            :link="`/organizations/${user.organization.internalId}`"
            class="text-blue"
          >
            {{ user.organization.name }}
          </CommonLink>
        </h3>
      </div>
    </div>
  </CommonLoader>
  <div v-if="user">
    <ObjectAttributes
      :attributes="objectAttributes"
      :object="user"
      :skip-attributes="['firstname', 'lastname']"
      :always-show-after-fields="user.policy.update"
    >
      <template v-if="user.policy.update" #after-fields>
        <CommonButton
          class="p-4"
          variant="primary"
          transparent-background
          @click="openEditUserDialog(user!)"
        >
          {{ $t('Edit Customer') }}
        </CommonButton>
      </template>
    </ObjectAttributes>
    <CommonOrganizationsList
      :organizations="secondaryOrganizations.array"
      :total-count="secondaryOrganizations.totalCount"
      :disable-show-more="loading"
      :label="__('Secondary organizations')"
      @show-more="loadAllSecondaryOrganizations()"
    />
    <CommonTicketStateList
      v-if="ticketsData"
      :counts="ticketsData.count"
      :tickets-link-query="ticketsData.query"
    />
  </div>
</template>
