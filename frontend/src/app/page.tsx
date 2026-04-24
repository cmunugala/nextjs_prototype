'use client';

import React, { useState, useEffect } from 'react';
import Workflow from './components/Workflow';
import { Database, BarChart3, Home as HomeIcon } from 'lucide-react';

const WORKFLOWS = [
  { id: 'workflow_1', name: 'Animal Finder', description: 'Map animals to countries with confidence scoring.', icon: <BarChart3 className="w-4 h-4" /> },
];

const SIDEBAR_WIDTH_KEY = 'databridge_sidebar_width';
const DEFAULT_SIDEBAR_WIDTH = 260;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 360;

export default function Home() {
  const [activeTab, setActiveTab] = useState('home');
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY));
    if (!Number.isFinite(savedWidth)) return;

    const nextWidth = Math.min(
      Math.max(savedWidth, MIN_SIDEBAR_WIDTH),
      MAX_SIDEBAR_WIDTH
    );
    const frameId = window.requestAnimationFrame(() => {
      setSidebarWidth(nextWidth);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (event: MouseEvent) => {
        const nextWidth = Math.min(
            Math.max(event.clientX, MIN_SIDEBAR_WIDTH),
            MAX_SIDEBAR_WIDTH
        );
        setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
        setIsResizingSidebar(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingSidebar]);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  const activeWorkflow = WORKFLOWS.find((workflow) => workflow.id === activeTab);

  const renderHome = () => (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
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

  return (
    <div className="flex min-h-screen bg-white font-sans text-slate-900 relative">
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-mongo-orange z-50 shadow-sm opacity-90"></div>

      <aside
        className="relative shrink-0 bg-mongo-mist flex flex-col border-r border-slate-200 pt-1"
        style={{ width: sidebarWidth }}
      >
        <div className="px-3 py-4 flex items-center gap-2">
          <div className="w-7 h-7 bg-mongo-green rounded-md flex items-center justify-center shadow-sm shrink-0">
            <Database className="text-white w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 overflow-hidden">
            <h1 className="text-sm font-bold tracking-tight text-mongo-dark whitespace-nowrap">DataBridge</h1>
          </div>
        </div>

        <nav className="flex-1 mt-3 overflow-y-auto">
          <div className="px-3 mb-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Main
          </div>
          <div
            className={`
              px-3 py-2.5 cursor-pointer transition-all duration-200 flex items-center gap-2.5
              ${activeTab === 'home' 
                ? 'bg-white text-mongo-green border-r-4 border-mongo-green font-semibold shadow-sm' 
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }
            `}
            onClick={() => setActiveTab('home')}
          >
            <HomeIcon className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'home' ? 'text-mongo-green' : 'text-slate-400'}`} />
            <span className="text-xs whitespace-nowrap overflow-hidden">Home</span>
          </div>

          <div className="px-3 mt-5 mb-1.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
            Flows
          </div>
          {WORKFLOWS.map((wf) => (
            <div
              key={wf.id}
              className={`
                px-3 py-2.5 cursor-pointer transition-all duration-200 flex items-center gap-2.5
                ${activeTab === wf.id 
                  ? 'bg-white text-mongo-green border-r-4 border-mongo-green font-semibold shadow-sm' 
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                }
              `}
              onClick={() => setActiveTab(wf.id)}
            >
              <div className={`shrink-0 ${activeTab === wf.id ? 'text-mongo-green' : 'text-slate-400'}`}>
                {wf.icon}
              </div>
              <span className="text-xs whitespace-nowrap overflow-hidden">{wf.name}</span>
            </div>
          ))}

        </nav>

        <div className="p-3 mt-auto border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-slate-200 flex items-center justify-center text-[9px] font-bold text-slate-600 shrink-0">
              CM
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[11px] font-semibold whitespace-nowrap text-slate-800">Chetan</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          aria-label="Resize sidebar"
          onMouseDown={(event) => {
            event.preventDefault();
            setIsResizingSidebar(true);
          }}
          className="absolute -right-1 top-0 h-full w-2 cursor-col-resize transition-colors hover:bg-mongo-sage/20"
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 px-8 py-10 bg-white overflow-y-auto">
        <header className="mb-8">
          <nav className="flex items-center text-[10px] text-slate-400 mb-2 gap-2 font-bold uppercase tracking-widest">
            <span>Workspace</span>
            <span>/</span>
            <span className="text-mongo-sage font-bold">
              {activeTab === 'home' ? 'Home' : activeWorkflow?.name}
            </span>
          </nav>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
            {activeTab === 'home' ? 'Home Overview' : activeWorkflow?.name}
          </h2>
          {activeTab !== 'home' && (
            <p className="text-slate-500 mt-2 max-w-2xl text-sm">
              {activeWorkflow?.description}
            </p>
          )}
        </header>

        <div className={`w-full ${activeTab === 'home' ? 'max-w-4xl' : 'max-w-7xl'}`}>
          {activeTab === 'home'
            ? renderHome()
            : activeWorkflow && (
                <Workflow
                  key={activeWorkflow.id}
                  id={activeWorkflow.id}
                />
              )}
        </div>
      </main>
    </div>
  );
}
