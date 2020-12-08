class Controllers::OrganizationsControllerPolicy < Controllers::ApplicationControllerPolicy
  permit! %i[destroy import_example], to: 'admin.organization'
  permit! :import_start, to: 'admin.user'
  permit! %i[create update search history], to: ['ticket.agent', 'admin.organization']

  def show?
    return true if user.permissions?(['ticket.agent', 'admin.organization'])

    record.params[:id].to_i == user.organization_id
  end
end
