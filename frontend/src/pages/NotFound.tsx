export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-32 text-center">
      <p className="text-6xl font-bold text-mc-text-muted mb-4">404</p>
      <p className="text-xl font-semibold text-mc-text-primary mb-2">Page not found</p>
      <p className="text-sm text-mc-text-muted mb-8">The page you're looking for doesn't exist.</p>
      <a href="/" className="mc-btn-primary text-sm">← Back to Dashboard</a>
    </div>
  );
}
