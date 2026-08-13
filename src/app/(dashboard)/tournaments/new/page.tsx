import { NewTournamentForm } from "./new-tournament-form";

export default function NewTournamentPage() {
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">新しい大会を作成</h1>
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <NewTournamentForm />
      </div>
    </div>
  );
}
