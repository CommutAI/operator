import { useRef } from 'react';
import {
  Video, Users, AlertCircle, Wifi, WifiOff, RefreshCw, CheckCircle, Loader2,
  Maximize2, Activity, Clock
} from 'lucide-react';
import { useBackendVideo } from '../hooks/useBackendVideo';

// Connection stages and their progress %
const CONNECTION_STAGES = {
  disconnected: { pct: 0,   label: 'Disconnected',        color: 'bg-red-500'    },
  connecting:   { pct: 25,  label: 'Locating camera…',     color: 'bg-yellow-400' },
  connected:    { pct: 75,  label: 'Starting stream…',    color: 'bg-blue-400'   },
  streaming:    { pct: 100, label: 'Streaming Live (4:3)', color: 'bg-green-500'  },
  error:        { pct: 25,  label: 'Reconnecting…',       color: 'bg-yellow-400' },
};

interface VideoMonitoringProps {
  autoConnect?: boolean;
}

const VideoMonitoring = ({ autoConnect = true }: VideoMonitoringProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    isStreaming,
    passengerCount,
    connectionStatus,
    connectionMessage,
    videoRef,
    refresh,
  } = useBackendVideo({ autoConnect });

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const displayStage = isStreaming
    ? 'streaming'
    : connectionStatus === 'connecting'
      ? 'connecting'
      : connectionStatus === 'connected'
      ? 'connected'
      : connectionStatus === 'error'
      ? 'error'
      : 'disconnected';

  const stage = CONNECTION_STAGES[displayStage as keyof typeof CONNECTION_STAGES] ?? CONNECTION_STAGES.disconnected;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white flex items-center gap-2.5">
            <Video className="text-orange-400" size={28} />
            Bus Video Monitoring
          </h1>
          <p className="text-white/60 text-sm mt-1">
            Real-time 4:3 camera stream with on-device YOLOv8n passenger detection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-medium flex items-center gap-2 transition-all border border-white/10 shadow-sm active:scale-95"
            title="Reconnect feed"
          >
            <RefreshCw size={14} />
            <span>Reconnect</span>
          </button>
        </div>
      </div>

      {/* Connection Progress Bar */}
      <div className="glass-card p-4 rounded-2xl space-y-2.5 border border-white/10">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            {displayStage === 'streaming' ? (
              <CheckCircle className="w-4 h-4 text-green-400" />
            ) : displayStage === 'connecting' || displayStage === 'connected' ? (
              <Loader2 className="w-4 h-4 text-yellow-400 animate-spin" />
            ) : displayStage === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-400" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-400" />
            )}
            <span className="text-white font-medium">{stage.label}</span>
            {connectionMessage && (
              <span className="text-white/40 text-[11px] hidden md:inline">• {connectionMessage}</span>
            )}
          </div>
          <span className="text-white/50 font-mono font-medium">{stage.pct}%</span>
        </div>

        {/* Track */}
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ease-in-out ${stage.color}`}
            style={{ width: `${stage.pct}%` }}
          />
        </div>

        {/* Stage indicators */}
        <div className="flex justify-between text-[11px] text-white/30 px-0.5">
          <span className={displayStage !== 'disconnected' && displayStage !== 'error' ? 'text-white/60' : ''}>Disconnected</span>
          <span className={displayStage === 'connecting' || displayStage === 'connected' || displayStage === 'streaming' ? 'text-white/60' : ''}>Locating</span>
          <span className={displayStage === 'connected' || displayStage === 'streaming' ? 'text-white/60' : ''}>Connected</span>
          <span className={displayStage === 'streaming' ? 'text-green-400 font-semibold' : ''}>Streaming (4:3)</span>
        </div>
      </div>

      {/* Main 4:3 Camera View Container (NO 16:9 PILLARBOXING) */}
      <div className="flex justify-center w-full">
        <div
          ref={containerRef}
          className="relative w-full max-w-[960px] xl:max-w-[1024px] aspect-[4/3] bg-gradient-to-b from-zinc-950 via-black to-zinc-950 rounded-2xl overflow-hidden border border-white/15 shadow-2xl ring-1 ring-white/10 flex items-center justify-center group"
        >
          {/* Always-mounted img for incoming JPEG frames */}
          <img
            ref={videoRef}
            alt="Live bus camera stream"
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isStreaming ? 'opacity-100 block' : 'opacity-0 hidden'
            }`}
          />

          {/* Offline / Placeholder Screen */}
          {!isStreaming && (
            <div className="absolute inset-0 flex items-center justify-center p-6 bg-gradient-to-b from-black/80 via-black/90 to-black/95">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 shadow-inner">
                  {connectionStatus === 'connecting' ? (
                    <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                  ) : (
                    <Video className="w-8 h-8 text-white/30" />
                  )}
                </div>
                <p className="text-white font-semibold text-base mb-1">
                  {connectionStatus === 'connecting'
                    ? 'Connecting to camera…'
                    : connectionStatus === 'connected'
                    ? 'Connected — Starting frames…'
                    : 'Camera feed unavailable'}
                </p>
                <p className="text-white/40 text-xs mb-4 leading-relaxed">
                  {connectionMessage || 'Waiting for live frames from Raspberry Pi camera.'}
                </p>
                <button
                  onClick={refresh}
                  className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 border border-orange-500/30 rounded-xl text-xs font-medium transition-all flex items-center gap-2 mx-auto active:scale-95 shadow-sm"
                >
                  <RefreshCw size={13} />
                  <span>Retry Stream</span>
                </button>
              </div>
            </div>
          )}

          {/* Top HUD Overlay */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between pointer-events-none z-10">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold backdrop-blur-md flex items-center gap-1.5 shadow-lg border ${
                isStreaming
                  ? 'bg-red-500/85 text-white border-red-400/40'
                  : 'bg-black/70 text-white/60 border-white/10'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isStreaming ? 'bg-white animate-pulse' : 'bg-red-400'}`} />
                {isStreaming ? 'LIVE' : 'OFFLINE'}
              </span>
              <span className="bg-black/70 backdrop-blur-md border border-white/10 text-white/90 text-xs px-2.5 py-1 rounded-full font-medium shadow-md">
                Bus #1 • Interior Camera
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="bg-black/70 backdrop-blur-md border border-white/10 text-white text-xs px-3 py-1 rounded-full font-bold flex items-center gap-1.5 shadow-lg">
                <Users size={13} className="text-orange-400" />
                <span>{passengerCount} Passenger{passengerCount === 1 ? '' : 's'}</span>
              </span>
              <button
                onClick={toggleFullscreen}
                className="pointer-events-auto bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/10 text-white/80 hover:text-white p-1.5 rounded-full transition-all shadow-md active:scale-95"
                title="Fullscreen"
              >
                <Maximize2 size={13} />
              </button>
            </div>
          </div>

          {/* Bottom HUD Overlay */}
          <div className="absolute bottom-3 inset-x-3 flex items-center justify-between pointer-events-none z-10 text-[11px] text-white/80">
            <div className="bg-black/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-2 shadow-md">
              <Activity size={12} className="text-emerald-400" />
              <span className="font-mono">AI: YOLOv8n</span>
              <span className="text-white/40">•</span>
              <span className="text-white/60">640×480 (4:3 Native)</span>
            </div>
            <div className="bg-black/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md">
              <Wifi size={12} className={isStreaming ? 'text-green-400' : 'text-white/40'} />
              <span className="font-medium capitalize">{isStreaming ? '30 FPS' : connectionStatus}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Telematics Stats Grid Below Feed */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Passenger Count */}
        <div className="glass-card p-3 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-xs mb-1">
            <span>Occupancy</span>
            <Users size={13} className="text-orange-400" />
          </div>
          <div>
            <div className="text-white text-2xl font-extrabold">{passengerCount}</div>
            <div className="text-white/50 text-[10px]">/ 30 capacity</div>
          </div>
        </div>

        {/* Stream Status */}
        <div className="glass-card p-3 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-xs mb-1">
            <span>Status</span>
            <Video size={13} className={isStreaming ? 'text-green-400' : 'text-white/40'} />
          </div>
          <div>
            <div className={`text-sm font-bold ${isStreaming ? 'text-green-400' : 'text-white/60'}`}>
              {isStreaming ? 'Streaming' : 'Inactive'}
            </div>
            <div className="text-white/50 text-[10px]">{isStreaming ? '30 FPS Live' : 'No Signal'}</div>
          </div>
        </div>

        {/* Aspect & Resolution */}
        <div className="glass-card p-3 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-xs mb-1">
            <span>Aspect Ratio</span>
            <Maximize2 size={13} className="text-purple-400" />
          </div>
          <div>
            <div className="text-white text-sm font-bold">4:3 Native</div>
            <div className="text-white/50 text-[10px]">640 × 480 px</div>
          </div>
        </div>

        {/* AI Detection */}
        <div className="glass-card p-3 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-xs mb-1">
            <span>AI Model</span>
            <Activity size={13} className="text-blue-400" />
          </div>
          <div>
            <div className="text-white text-sm font-bold">YOLOv8n</div>
            <div className="text-emerald-400 text-[10px]">Active Bounding</div>
          </div>
        </div>

        {/* Latency */}
        <div className="glass-card p-3 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-xs mb-1">
            <span>Latency</span>
            <Clock size={13} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-white text-sm font-bold">&lt; 100 ms</div>
            <div className="text-white/50 text-[10px]">Direct WS Tunnel</div>
          </div>
        </div>

        {/* Pipeline Connection */}
        <div className="glass-card p-3 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-white/50 text-xs mb-1">
            <span>Pipeline</span>
            <Wifi size={13} className="text-orange-400" />
          </div>
          <div>
            <div className="text-white text-sm font-bold capitalize truncate">{connectionStatus}</div>
            <div className="text-white/50 text-[10px] truncate">Pi Cloudflare</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoMonitoring;
