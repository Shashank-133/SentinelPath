'use client';

import { useState } from 'react';

interface ReportIncidentProps {
  latitude: number;
  longitude: number;
  onClose: () => void;
  onSubmitSuccess: () => void;
}

export default function ReportIncident({
  latitude,
  longitude,
  onClose,
  onSubmitSuccess
}: ReportIncidentProps) {
  const [category, setCategory] = useState('poor_lighting');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorReasons, setErrorReasons] = useState<string[]>([]);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorReasons([]);

    try {
      const response = await fetch('http://127.0.0.1:8000/api/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude,
          longitude,
          category,
          description: description.trim() || null
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Validation error from moderation filters
        const reasons = data.detail?.reasons || [data.detail || 'Failed to submit report.'];
        setErrorReasons(reasons);
      } else {
        setSuccess(true);
        setTimeout(() => {
          onSubmitSuccess();
          onClose();
        }, 1500);
      }
    } catch (err) {
      setErrorReasons(['Server connection failed. Ensure FastAPI backend is running.']);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '20px', background: 'rgba(10, 15, 30, 0.95)', border: '1px solid rgba(0, 242, 254, 0.2)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff' }}>📢 Report Safety Alert</h3>
        <button 
          onClick={onClose} 
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          &times;
        </button>
      </div>

      <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-color)', padding: '10px 14px', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '16px' }}>
        <span>📍 Coordinates: {latitude.toFixed(5)}, {longitude.toFixed(5)}</span>
      </div>

      {success ? (
        <div style={{ color: 'var(--color-safe)', fontSize: '0.9rem', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
          ✓ Report submitted anonymously! Refreshing map...
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="input-group">
            <label className="input-label">Alert Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="text-input"
              style={{ background: '#0a0f1d', cursor: 'pointer' }}
            >
              <option value="poor_lighting">💡 Poor Lighting</option>
              <option value="harassment">⚠️ Harassment Area</option>
              <option value="suspicious_activity">👁️ Suspicious Activity</option>
              <option value="other">📍 Other Safety Risk</option>
            </select>
          </div>

          <div className="input-group">
            <label className="input-label">Description (Optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., streetlights broken for the past week, suspicious group loitering..."
              className="text-input"
              rows={3}
              style={{ resize: 'none' }}
            />
          </div>

          {errorReasons.length > 0 && (
            <div style={{ color: 'var(--color-danger)', fontSize: '0.8rem', padding: '10px', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <strong>Report Moderated / Invalid:</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {errorReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button 
              type="button" 
              onClick={onClose} 
              className="secondary-btn" 
              style={{ flex: 1, padding: '10px' }}
              disabled={loading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="primary-btn" 
              style={{ flex: 1, padding: '10px' }}
              disabled={loading}
            >
              {loading ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
