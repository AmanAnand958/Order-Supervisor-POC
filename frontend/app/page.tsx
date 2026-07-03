import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[75vh] text-center gap-12 relative overflow-hidden">
      {/* Decorative Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f293710_1px,transparent_1px),linear-gradient(to_bottom,#1f293710_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] -z-20" />
      
      <div className="max-w-3xl space-y-6">
        <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-semibold tracking-wide text-blue-400 uppercase">
          🚀 Next-Gen Order Operations
        </div>
        <h1 className="text-5xl sm:text-6xl font-black tracking-tight leading-none text-white">
          Long-Running <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent">AI Supervisors</span>
        </h1>
        <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto font-light leading-relaxed">
          Monitor commerce events with persistent, event-driven agents. Built on Temporal's robust workflow engine and powered by Llama 3.3.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 z-10">
        <Link
          href="/supervisors"
          className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-500/25 transition-all duration-200 hover:-translate-y-0.5"
        >
          Supervisors Console →
        </Link>
        <Link
          href="/runs"
          className="px-8 py-4 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-white rounded-xl font-semibold transition-all duration-200 hover:-translate-y-0.5"
        >
          Active Runs List
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl w-full mt-8">
        <div className="bg-gray-900/40 backdrop-blur border border-gray-800/80 rounded-2xl p-6 text-left hover:border-blue-500/30 transition-all duration-300 group">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-lg mb-4 group-hover:scale-110 transition-transform duration-200">
            🔄
          </div>
          <h3 className="text-white font-bold text-base mb-2">Temporal Workflows</h3>
          <p className="text-gray-400 text-sm leading-relaxed font-light">
            Each order gets its own resilient, durable state machine. Wakes up instantly on event signals or wake-up timers.
          </p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur border border-gray-800/80 rounded-2xl p-6 text-left hover:border-purple-500/30 transition-all duration-300 group">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-lg mb-4 group-hover:scale-110 transition-transform duration-200">
            🤖
          </div>
          <h3 className="text-white font-bold text-base mb-2">Llama 3.3 Agent</h3>
          <p className="text-gray-400 text-sm leading-relaxed font-light">
            Decides actions, structures next check-in cycles, and dynamically creates timeline summaries at every wake loop.
          </p>
        </div>

        <div className="bg-gray-900/40 backdrop-blur border border-gray-800/80 rounded-2xl p-6 text-left hover:border-indigo-500/30 transition-all duration-300 group">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-lg mb-4 group-hover:scale-110 transition-transform duration-200">
            📊
          </div>
          <h3 className="text-white font-bold text-base mb-2">Operation Dashboard</h3>
          <p className="text-gray-400 text-sm leading-relaxed font-light">
            Inspect execution state, add custom instructions mid-flight, inject events manually, and review final summaries.
          </p>
        </div>
      </div>
    </div>
  );
}
