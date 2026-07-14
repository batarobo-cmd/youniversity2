<script lang="ts">
  import AdminSettingsPlanned from '$lib/components/AdminSettingsPlanned.svelte';
</script>

<AdminSettingsPlanned
  sectionId="email"
  titleKey="admin.settingsEmailTitle"
  descKey="admin.settingsEmailSub"
  featureKeys={[
    'admin.settingsEmailFeature1',
    'admin.settingsEmailFeature2',
    'admin.settingsEmailFeature3',
    'admin.settingsEmailFeature4',
    'admin.settingsEmailFeature5',
  ]}
/>
