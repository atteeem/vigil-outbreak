import { LoginForm } from "@/components/admin/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";
  return (
    <main className="mx-auto max-w-sm py-16">
      <h1 className="mb-1 text-lg font-semibold">Admin sign-in</h1>
      <p className="mb-4 text-xs text-ink-dim">Restricted to VIGIL OUTBREAK analysts.</p>
      <LoginForm next={safeNext} />
    </main>
  );
}
