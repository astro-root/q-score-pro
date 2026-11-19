import { NewTournamentForm } from "./new-tournament-form";

export default function NewTournamentPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-ink">新しい大会を作成</h1>
      <div className="rounded-lg border border-border bg-surface p-6">
        <NewTournamentForm />
      </div>
    </div>
  );
}
