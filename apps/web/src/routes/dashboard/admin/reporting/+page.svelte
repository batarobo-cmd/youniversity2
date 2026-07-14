<script lang="ts">
  import AdminSettingsPlanned from '$lib/components/AdminSettingsPlanned.svelte';
  import '$lib/styles/admin-settings.css';
</script>

<AdminSettingsPlanned
  sectionId="reporting"
  titleKey="admin.settingsReportingTitle"
  descKey="admin.settingsReportingSub"
  featureKeys={[
    'admin.settingsReportingFeature1',
    'admin.settingsReportingFeature2',
    'admin.settingsReportingFeature3',
    'admin.settingsReportingFeature4',
    'admin.settingsReportingFeature5',
    'admin.settingsReportingFeature6',
    'admin.settingsReportingFeature7',
  ]}
/>
