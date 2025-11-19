export default function Home() {
  // Middleware handles redirect:
  // - Not logged in → redirects to /login
  // - Logged in → redirects to /setup
  
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-zinc-600 dark:text-zinc-400">Redirecting...</p>
      </div>
    </div>
  );
}
