"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signIn } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="email" label="メールアドレス" error={state?.fieldErrors?.email?.[0]}>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field id="password" label="パスワード" error={state?.fieldErrors?.password?.[0]}>
        <Input id="password" name="password" type="password" required autoComplete="current-password" />
      </Field>

      {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}

      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "ログイン中..." : "ログイン"}
      </Button>

      <p className="text-center text-sm text-muted">
        アカウントをお持ちでない方は{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          新規登録
        </Link>
      </p>
    </form>
  );
}
