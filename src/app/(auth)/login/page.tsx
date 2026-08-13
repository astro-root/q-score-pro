import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Q-Score Pro</h1>
        <p className="mb-6 text-sm text-slate-500">大会運営プラットフォームにログイン</p>
        <LoginForm />
      </div>
    </div>
  );
}
