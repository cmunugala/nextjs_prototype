'use client';

import React, { useState, useEffect } from 'react';
import Workflow from './components/Workflow';
import { Database, BarChart3, Home as HomeIcon, ArrowRight, Activity, Clock, History, CheckCircle2, Timer, AlertCircle, Loader2 } from 'lucide-react';

const WORKFLOWS = [
  { id: 'workflow_1', name: 'Animal Finder', description: 'Map animals to countries with confidence scoring.', icon: <BarChart3 className="w-5 h-5" /> },
];

const API_BASE_URL = 'http://localhost:8000';//this is what we send requests to from the frontend (backend)

export default function Home() {
  const [activeTab, setActiveTab] = useState('home');
  const [history, setHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []); //essentially runs this exactly once after the page has loaded

  useEffect(() => {
    if (isMounted && activeTab === 'history') {
        fetchHistory();
    }
  }, [activeTab, isMounted]);

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
        const res = await fetch(`${API_BASE_URL}/api/history`);
        const data = await res.json();
        setHistory(data);
    } catch (error) {
        console.error("Failed to fetch history:", error);
    } finally {
        setIsLoadingHistory(false);
    }
  };

  const renderHome = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="bg-mongo-mist border border-slate-200 rounded-2xl p-8 relative overflow-hidden">
        <div className="relative z-10">
          <h3 className="text-2xl font-bold text-slate-900 mb-2">Welcome back, Chetan</h3>
          <p className="text-slate-500 max-w-lg mb-6 text-sm">
            Your workspace is synchronized and ready. Select a specialized workflow below or resume your recent activity.
          </p>
          <button 
            onClick={() => setActiveTab(WORKFLOWS[0].id)}
            className="flex items-center gap-2 bg-mongo-green text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-800 transition-all shadow-sm"
          >
            Launch Animal Finder <ArrowRight className="w-4 h-4" />
          </button>
        </div>
        <div className="absolute right-[-20px] top-[-20px] opacity-5">
            <Database size={200} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 border border-slate-100 rounded-xl bg-white shadow-sm">
            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4">
                <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">System Load</p>
            <p className="text-xl font-bold text-slate-900">Normal</p>
        </div>
        <div className="p-6 border border-slate-100 rounded-xl bg-white shadow-sm">
            <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center mb-4">
                <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Last Sync</p>
            <p className="text-xl font-bold text-slate-900">Live</p>
        </div>
        <div className="p-6 border border-slate-100 rounded-xl bg-white shadow-sm">
            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center mb-4">
                <Database className="w-5 h-5 text-green-600" />
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Jobs</p>
            <p className="text-xl font-bold text-slate-900">{history.length}</p>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-6">Available Workflows</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {WORKFLOWS.map(wf => (
                <div 
                    key={wf.id}
                    onClick={() => setActiveTab(wf.id)}
                    className="p-5 border border-slate-200 rounded-xl bg-white hover:border-mongo-sage hover:shadow-md transition-all cursor-pointer group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-50 rounded-lg text-slate-400 group-hover:text-mongo-sage group-hover:bg-mongo-mist transition-colors">
                            {wf.icon}
                        </div>
                        <div>
                            <p className="font-bold text-slate-800 text-sm">{wf.name}</p>
                            <p className="text-xs text-slate-500 line-clamp-1">{wf.description}</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm animate-in fade-in duration-500">
      {isLoadingHistory ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p className="text-sm font-medium">Querying SQLite Database...</p>
        </div>
      ) : (
        <>
            <table className="w-full text-left border-collapse">
                <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Job ID</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filename</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Created At</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Status</th>
                </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                {history.map((job) => (
                    <tr key={job.job_id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                        <span className="text-sm font-bold text-mongo-orange font-mono tracking-tighter bg-mongo-orange/5 px-2 py-1 rounded">
                            {job.job_id.substring(0, 8)}...
                        </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-700">{job.filename}</td>
                    <td className="px-6 py-4 text-sm text-slate-400">{job.created_at}</td>
                    <td className="px-6 py-4 text-right">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide
                        ${job.status === 'completed' ? 'bg-green-50 text-green-700' : (job.status === 'failed' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700')}
                        `}>
                        {job.status === 'completed' ? <CheckCircle2 className="w-3 h-3" /> : (job.status === 'failed' ? <AlertCircle className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />)}
                        {job.status}
                        </span>
                    </td>
                    </tr>
                ))}
                {history.length === 0 && (
                    <tr>
                        <td colSpan={4} className="px-6 py-20 text-center text-slate-400 text-sm italic">
                            No workflow history found in the local database.
                        </td>
                    </tr>
                )}
                </tbody>
            </table>
            <div className="p-4 bg-slate-50/50 border-t border-slate-100 flex justify-center">
                <button 
                    onClick={fetchHistory}
                    className="text-[10px] font-bold text-slate-400 hover:text-mongo-sage uppercase tracking-widest transition-colors flex items-center gap-2"
                >
                    <Timer className="w-3 h-3" /> Refresh Logs
                </button>
            </div>
        </>
      )}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900 relative">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-mongo-orange z-50 shadow-sm opacity-90"></div>

      <aside className="w-72 bg-mongo-mist flex flex-col border-r border-slate-200 pt-1">
        <div className="p-8 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-mongo-green rounded-lg flex items-center justify-center shadow-sm">
            <Database className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-mongo-dark">DataBridge</h1>
            <p className="text-[10px] text-mongo-sage uppercase tracking-widest font-bold">Standard</p>
          </div>
        </div>

        <nav className="flex-1 mt-8 overflow-y-auto">
          <div className="px-6 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            General
          </div>
          <div
            className={`
              px-6 py-4 cursor-pointer transition-all duration-200 flex items-center gap-4
              ${activeTab === 'home' 
                ? 'bg-white text-mongo-green border-r-4 border-mongo-green font-semibold shadow-sm' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }
            `}
            onClick={() => setActiveTab('home')}
          >
            <HomeIcon className={`w-5 h-5 ${activeTab === 'home' ? 'text-mongo-green' : 'text-slate-400'}`} />
            <span className="text-sm">Home Overview</span>
          </div>

          <div className="px-6 mt-8 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Workflows
          </div>
          {WORKFLOWS.map((wf) => (
            <div
              key={wf.id}
              className={`
                px-6 py-4 cursor-pointer transition-all duration-200 flex items-center gap-4
                ${activeTab === wf.id 
                  ? 'bg-white text-mongo-green border-r-4 border-mongo-green font-semibold shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }
              `}
              onClick={() => setActiveTab(wf.id)}
            >
              <div className={activeTab === wf.id ? 'text-mongo-green' : 'text-slate-400'}>
                {wf.icon}
              </div>
              <span className="text-sm">{wf.name}</span>
            </div>
          ))}

          <div className="px-6 mt-8 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            Archives
          </div>
          <div
            className={`
              px-6 py-4 cursor-pointer transition-all duration-200 flex items-center gap-4
              ${activeTab === 'history' 
                ? 'bg-white text-mongo-green border-r-4 border-mongo-green font-semibold shadow-sm' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }
            `}
            onClick={() => setActiveTab('history')}
          >
            <History className={`w-5 h-5 ${activeTab === 'history' ? 'text-mongo-green' : 'text-slate-400'}`} />
            <span className="text-sm">Execution History</span>
          </div>
        </nav>

        <div className="p-6 mt-auto border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
              CM
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold truncate text-slate-800">Chetan Munugala</p>
              <p className="text-[10px] text-slate-500 truncate">Account Settings</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 bg-white overflow-y-auto pt-16">
        <header className="mb-12">
          <nav className="flex items-center text-[10px] text-slate-400 mb-2 gap-2 font-bold uppercase tracking-widest">
            <span>Workspace</span>
            <span>/</span>
            <span className="text-mongo-sage font-bold">
              {activeTab === 'home' ? 'Home' : (activeTab === 'history' ? 'History' : WORKFLOWS.find(w => w.id === activeTab)?.name)}
            </span>
          </nav>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            {activeTab === 'home' ? 'Home Overview' : (activeTab === 'history' ? 'Execution History' : WORKFLOWS.find(w => w.id === activeTab)?.name)}
          </h2>
          {activeTab !== 'home' && activeTab !== 'history' && (
            <p className="text-slate-500 mt-2 max-w-2xl text-sm">
              {WORKFLOWS.find(w => w.id === activeTab)?.description}
            </p>
          )}
          {activeTab === 'history' && (
            <p className="text-slate-500 mt-2 max-w-2xl text-sm">
              Review and manage your previous LLM workflow executions and audit logs from the local database.
            </p>
          )}
        </header>

        <div className="max-w-4xl">
          {activeTab === 'home' ? renderHome() : (
            activeTab === 'history' ? renderHistory() : (
              WORKFLOWS.map((wf) => (
                activeTab === wf.id && (
                  <Workflow 
                    key={wf.id} 
                    id={wf.id} 
                    name={wf.name} 
                  />
                )
              ))
            )
          )}
        </div>
      </main>
    </div>
  );
}
