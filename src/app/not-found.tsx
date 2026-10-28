export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-6xl font-black text-foreground/10">404</div>
        <h1 className="text-xl font-bold text-foreground">Page Not Found</h1>
        <p className="text-sm text-gray-500">{"The page you're looking for doesn't exist."}</p>
        <a href="/dashboard" className="inline-block px-6 py-2.5 rounded-xl bg-foreground/10 text-foreground text-sm font-bold hover:bg-foreground/20 transition-colors">
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

