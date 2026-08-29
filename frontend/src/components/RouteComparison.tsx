'use client';

interface RouteComparisonProps {
  routes: any[];
  selectedIndex: number;
  onSelectRoute: (index: number) => void;
}

export default function RouteComparison({
  routes,
  selectedIndex,
  onSelectRoute
}: RouteComparisonProps) {
  if (routes.length === 0) return null;

  const formatTime = (seconds: number) => {
    const mins = Math.round(seconds / 60);
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs} hr ${remMins} min`;
    }
    return `${mins} min`;
  };

  const formatDistance = (meters: number) => {
    return `${(meters / 1000).toFixed(1)} km`;
  };

  return (
    <div className="input-group" style={{ gap: '12px' }}>
      <label className="input-label">Alternative Routes Found</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {routes.map((route, idx) => {
          const isSelected = idx === selectedIndex;
          const score = route.safety_score;
          
          // Safety grade color
          let scoreColor = 'var(--color-danger)';
          if (score >= 80) scoreColor = 'var(--color-safe)';
          else if (score >= 50) scoreColor = 'var(--color-warning)';

          const { baseline_risk_penalty, incidents_penalty, time_penalty, emergency_bonus } = route.safety_breakdown;

          return (
            <div
              key={idx}
              onClick={() => onSelectRoute(idx)}
              className="glass-panel"
              style={{
                padding: '16px',
                cursor: 'pointer',
                borderWidth: isSelected ? '1.5px' : '1px',
                borderColor: isSelected 
                  ? (route.is_recommended ? 'var(--color-safe)' : 'var(--color-primary)')
                  : 'var(--border-color)',
                boxShadow: isSelected 
                  ? (route.is_recommended ? 'var(--shadow-safe-glow)' : 'var(--shadow-glow)')
                  : 'none',
                background: isSelected ? 'rgba(255, 255, 255, 0.03)' : 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>
                    Route {String.fromCharCode(65 + idx)}
                  </span>
                  {route.is_recommended && (
                    <span 
                      style={{ 
                        fontSize: '0.7rem', 
                        background: 'rgba(16, 185, 129, 0.12)', 
                        color: 'var(--color-safe)', 
                        padding: '2px 8px', 
                        borderRadius: '4px',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        fontWeight: 600
                      }}
                    >
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', flexDirection: 'column' }}>
                  <span style={{ fontSize: '1.2rem', fontWeight: 800, color: scoreColor }}>
                    {score}/100
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-muted)', fontWeight: 500 }}>
                    Safety Score
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '14px', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '10px' }}>
                <span>⏱️ {formatTime(route.duration)}</span>
                <span>📏 {formatDistance(route.distance)}</span>
              </div>

              {/* Show breakdown when selected */}
              {isSelected && (
                <div 
                  style={{ 
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)', 
                    paddingTop: '8px', 
                    marginTop: '8px', 
                    fontSize: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    color: '#cbd5e1'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>District crime baseline penalty:</span>
                    <span style={{ color: 'var(--color-danger)' }}>-{baseline_risk_penalty}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Nearby incident reports density:</span>
                    <span style={{ color: 'var(--color-danger)' }}>-{incidents_penalty}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Nighttime risk penalty (9PM-5AM):</span>
                    <span style={{ color: 'var(--color-danger)' }}>-{time_penalty}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Emergency services safety bonus:</span>
                    <span style={{ color: 'var(--color-safe)' }}>+{emergency_bonus}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
