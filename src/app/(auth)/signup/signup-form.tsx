"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Field, FormMessage } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="displayName" label="表示名" hint="スタッフ一覧などに表示されます" error={state?.fieldErrors?.displayName?.[0]}>
        <Input id="displayName" name="displayName" type="text" required />
      </Field>
      <Field id="email" label="メールアドレス" error={state?.fieldErrors?.email?.[0]}>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Field id="password" label="パスワード" error={state?.fieldErrors?.password?.[0]}>
        <Input id="password" name="password" type="password" required autoComplete="new-password" />
      </Field>

      {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}

      <Button type="submit" disabled={pending} className="mt-1 w-full">
        {pending ? "登録中..." : "アカウント作成"}
      </Button>

      <p className="text-center text-sm text-muted">
        すでにアカウントをお持ちの方は{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          ログイン
        </Link>
      </p>
    </form>
  );
}
