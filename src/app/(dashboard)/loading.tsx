export default function DashboardSectionLoading() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-3 border-pw-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-pw-text-muted">Caricamento...</p>
      </div>
    </div>
  );
}
