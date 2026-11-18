import { AuthShell } from "../auth-shell";
import { SignUpForm } from "./signup-form";

export default function SignUpPage() {
  return (
    <AuthShell title="アカウント作成" subtitle="大会運営スタッフ・主催者のアカウントを作成します">
      <SignUpForm />
    </AuthShell>
  );
}
