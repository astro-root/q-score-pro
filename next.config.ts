import type { NextConfig } from "next";

/**
 * セキュリティヘッダー (R-09 / Issue 13)。
 *
 * - X-Frame-Options: DENY ... 管理画面をクリックジャッキングから守る。
 *   ただし /obs/* は除外する(配信ツールや他サイトへの埋め込みを妨げないため。
 *   OBS Browser Source 自体は iframe ではないので DENY でも動くが、
 *   表示画面は公開前提のため埋め込みを許可しておく)。
 * - X-Content-Type-Options: nosniff ... MIMEスニッフィング対策。
 * - Referrer-Policy ... 他サイトへ遷移する際にURL全体(大会IDなど)を渡さない。
 * - Permissions-Policy ... 使わないブラウザ機能を無効化。
 *
 * CSP(Content-Security-Policy)は、Next.js のインラインスクリプトに nonce を
 * 発行する設計とセットで導入する必要があり、誤ると画面全体が動かなくなるため
 * このコミットでは入れていない(別途対応)。HSTS はホスティング側で設定する想定。
 */
const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: baseSecurityHeaders,
      },
      {
        // /obs/ で始まるパス以外すべて
        source: "/((?!obs/).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
    ];
  },
};

export default nextConfig;
