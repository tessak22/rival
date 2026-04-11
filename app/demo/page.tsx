import { DemoClient } from "@/components/demo/DemoClient";

export default function DemoPage() {
  return (
    <main className="dashboard-page">
      <header className="page-header">
        <h1>Rival Demo</h1>
        <p>Run a live, anonymous competitive scan (3/day per IP).</p>
      </header>

      <DemoClient />
    </main>
  );
}
