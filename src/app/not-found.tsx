export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="text-6xl font-black text-white/10">404</div>
        <h1 className="text-xl font-bold text-white">Page Not Found</h1>
        <p className="text-sm text-gray-500">{"The page you're looking for doesn't exist."}</p>
        <a href="/dashboard" className="inline-block px-6 py-2.5 rounded-xl bg-white/10 text-white text-sm font-bold hover:bg-white/20 transition-colors">
          Go to Dashboard
        </a>
      </div>
    </div>
  );
}

