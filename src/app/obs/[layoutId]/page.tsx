import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildDisplayContext } from "@/lib/display/context";
import { ObsDisplay } from "./obs-display";

// This route is intentionally outside the (dashboard) layout: no header,
// no navigation, no auth gate - just the rendered graphic, exactly what
// OBS's Browser Source should load (master spec section 25/26). Access is
// governed entirely by the public RLS policies added in migration 0008
// (rounds/round_participants/participants/display_layouts, all scoped to
// "tournament is not DRAFT") - this page itself performs no additional
// authorization check beyond what those SELECT queries naturally return.
export default async function ObsPage({
  params,
  searchParams,
}: {
  params: Promise<{ layoutId: string }>;
  searchParams: Promise<{ round?: string }>;
}) {
  const { layoutId } = await params;
  const { round: roundId } = await searchParams;

  if (!roundId) {
    return (
      <div style={{ padding: 24, fontFamily: "sans-serif", color: "#fff", background: "#000" }}>
        URLに ?round=&lt;ラウンドID&gt; を指定してください。
      </div>
    );
  }

  const supabase = await createClient();

  const { data: layout } = await supabase
    .from("display_layouts")
    .select("data")
    .eq("id", layoutId)
    .maybeSingle();
  if (!layout) notFound();

  const context = await buildDisplayContext(supabase, roundId);
  if (!context) notFound();

  return <ObsDisplay layout={layout.data} roundId={roundId} initialContext={context} />;
}
