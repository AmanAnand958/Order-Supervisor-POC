import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-8">
      <div>
        <div className="text-6xl mb-4">⚡</div>
        <h1 className="text-4xl font-bold text-white mb-2">Order Supervisor</h1>
        <p className="text-gray-400 text-lg max-w-xl">
          AI-powered long-running workflow supervisor. One Temporal workflow per order,
          waking on signals and timers, with Groq LLM decision-making.
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/supervisors"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
        >
          Supervisors →
        </Link>
        <Link
          href="/runs"
          className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
        >
          Active Runs →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-4 text-sm text-gray-500">
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-white font-medium mb-1">🔄 Temporal Workflows</div>
          Long-running per-order workflows with signals and queries
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-white font-medium mb-1">🤖 Groq LLM Agent</div>
          mixtral-8x7b-32768 makes decisions on every wake cycle
        </div>
        <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="text-white font-medium mb-1">📊 Live Timeline</div>
          Real-time event feed from DB with live workflow queries
        </div>
      </div>
    </div>
  );
}
