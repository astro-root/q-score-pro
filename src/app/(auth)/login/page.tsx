import { AuthShell } from "../auth-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell title="ログイン" subtitle="大会運営プラットフォームにログイン">
      <LoginForm />
    </AuthShell>
  );
}
