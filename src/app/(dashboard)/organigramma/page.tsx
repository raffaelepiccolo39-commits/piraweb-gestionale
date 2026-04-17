'use client';

export default function OrganigrammaPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">Organigramma</h1>
        <p className="text-sm text-pw-text-muted">Struttura organizzativa PiraWeb Creative Agency</p>
      </div>

      {/* Chart */}
      <div className="bg-pw-surface rounded-2xl border border-pw-border p-4 sm:p-6 overflow-x-auto">
        <svg
          viewBox="0 0 880 480"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full"
          style={{ minWidth: 580 }}
        >
          <defs>
            <marker id="arr-gray" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
            </marker>
            <marker id="arr-red" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
            </marker>
            <marker id="arr-blue" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#818cf8" />
            </marker>
            <marker id="arr-green" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d399" />
            </marker>
          </defs>

          {/* ===== CONNECTIONS ===== */}

          {/* Hierarchy (solid gray): CEO → Bernis */}
          <line x1="610" y1="65" x2="502" y2="65" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#arr-gray)" />

          {/* Hierarchy (solid gray): CEO → Sales Account */}
          <line x1="735" y1="110" x2="735" y2="258" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#arr-gray)" />

          {/* Red dashed: Bernis → Manuela (SMM assigns tasks) */}
          <line x1="290" y1="65" x2="217" y2="65" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="7,4" markerEnd="url(#arr-red)" />

          {/* Red dashed: Bernis → Raffaela (SMM assigns tasks) */}
          <path d="M 395 100 L 395 145 L 370 145 L 370 198" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="7,4" fill="none" markerEnd="url(#arr-red)" />

          {/* Blue dashed: CEO (Web Specialist) → Raffaela */}
          <path d="M 610 90 C 540 90 540 235 472 235" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="8,4" fill="none" markerEnd="url(#arr-blue)" />

          {/* Blue dashed: CEO (Web Specialist) → Gaia */}
          <path d="M 735 110 C 735 170 620 350 487 385" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="8,4" fill="none" markerEnd="url(#arr-blue)" />

          {/* Green dashed bidirectional: Manuela ↔ Raffaela (collaboration) */}
          <path d="M 117 100 L 117 235 L 268 235" stroke="#34d399" strokeWidth="1.5" strokeDasharray="6,3" fill="none" markerStart="url(#arr-green)" markerEnd="url(#arr-green)" />

          {/* Green dashed bidirectional: Raffaela ↔ Gaia (collaboration) */}
          <line x1="370" y1="270" x2="370" y2="348" stroke="#34d399" strokeWidth="1.5" strokeDasharray="6,3" markerStart="url(#arr-green)" markerEnd="url(#arr-green)" />

          {/* ===== NODES (drawn last so they appear on top of lines) ===== */}

          {/* CEO — Raffaele Antonio Piccolo */}
          <rect x="610" y="20" width="250" height="90" rx="10" ry="10" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.5" />
          <text x="735" y="55" textAnchor="middle" fill="#a5b4fc" fontSize="14" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Raffaele Antonio Piccolo</text>
          <text x="735" y="78" textAnchor="middle" fill="#6366f1" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">CEO · Web Specialist · ADV · Fotografo</text>

          {/* Bernis Del Villano — Social Media Manager */}
          <rect x="290" y="30" width="210" height="70" rx="10" ry="10" fill="#431407" stroke="#fb923c" strokeWidth="1.5" />
          <text x="395" y="61" textAnchor="middle" fill="#fdba74" fontSize="13" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Bernis Del Villano</text>
          <text x="395" y="80" textAnchor="middle" fill="#ea580c" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">Social Media Manager</text>

          {/* Manuela Del Villano — Content Creator */}
          <rect x="20" y="30" width="195" height="70" rx="10" ry="10" fill="#431407" stroke="#fb923c" strokeWidth="1.5" />
          <text x="117" y="61" textAnchor="middle" fill="#fdba74" fontSize="12" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Manuela Del Villano</text>
          <text x="117" y="80" textAnchor="middle" fill="#ea580c" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">Content Creator</text>

          {/* Raffaela Sparaco — Graphic Design */}
          <rect x="268" y="200" width="200" height="70" rx="10" ry="10" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.5" />
          <text x="368" y="231" textAnchor="middle" fill="#a5b4fc" fontSize="12" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Raffaela Sparaco</text>
          <text x="368" y="250" textAnchor="middle" fill="#6366f1" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">Graphic Design</text>

          {/* Gaia Coppeto — Graphic Design UI/UX e Brand */}
          <rect x="258" y="350" width="225" height="80" rx="10" ry="10" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.5" />
          <text x="370" y="378" textAnchor="middle" fill="#a5b4fc" fontSize="12" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Gaia Coppeto</text>
          <text x="370" y="396" textAnchor="middle" fill="#6366f1" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">Graphic Design</text>
          <text x="370" y="413" textAnchor="middle" fill="#6366f1" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">UI/UX e Brand</text>

          {/* Sales Account — Posizione aperta */}
          <rect x="625" y="260" width="220" height="70" rx="10" ry="10" fill="#111827" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="8,4" />
          <text x="735" y="291" textAnchor="middle" fill="#9ca3af" fontSize="13" fontWeight="bold" fontStyle="italic" fontFamily="ui-sans-serif,system-ui,sans-serif">Sales Account</text>
          <text x="735" y="310" textAnchor="middle" fill="#6b7280" fontSize="11" fontStyle="italic" fontFamily="ui-sans-serif,system-ui,sans-serif">Posizione aperta</text>
        </svg>
      </div>

      {/* Legend */}
      <div className="bg-pw-surface rounded-2xl border border-pw-border p-5">
        <h3 className="text-sm font-semibold text-pw-text mb-4">Legenda</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

          {/* Gray solid */}
          <div className="flex items-center gap-3">
            <div className="flex items-center shrink-0">
              <div className="w-8 h-0.5 bg-gray-500" />
              <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid #6b7280' }} />
            </div>
            <span className="text-sm text-pw-text-muted">Gerarchia — riporta al CEO</span>
          </div>

          {/* Red dashed */}
          <div className="flex items-center gap-3">
            <div className="flex items-center shrink-0">
              <div className="w-8 h-0 border-t-2 border-dashed border-red-500" />
              <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid #ef4444' }} />
            </div>
            <span className="text-sm text-pw-text-muted">Assegna compiti — Social Media Manager</span>
          </div>

          {/* Blue dashed */}
          <div className="flex items-center gap-3">
            <div className="flex items-center shrink-0">
              <div className="w-8 h-0 border-t-2 border-dashed border-indigo-400" />
              <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid #818cf8' }} />
            </div>
            <span className="text-sm text-pw-text-muted">Assegna compiti — Web Specialist</span>
          </div>

          {/* Green dashed bidirectional */}
          <div className="flex items-center gap-3">
            <div className="flex items-center shrink-0">
              <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderRight: '7px solid #34d399' }} />
              <div className="w-6 h-0 border-t-2 border-dashed border-teal-400" />
              <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid #34d399' }} />
            </div>
            <span className="text-sm text-pw-text-muted">Collaborazione / confronto diretto</span>
          </div>

        </div>

        <h3 className="text-sm font-semibold text-pw-text mt-5 mb-3">Aree</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-10 h-6 rounded border-2 border-indigo-500 bg-indigo-950" />
            <span className="text-sm text-pw-text-muted">CEO / Leadership</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-10 h-6 rounded border-2 border-orange-400 bg-orange-950" />
            <span className="text-sm text-pw-text-muted">Area Social & Content</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-10 h-6 rounded border-2 border-indigo-400 bg-indigo-950" />
            <span className="text-sm text-pw-text-muted">Area Design</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-10 h-6 rounded border-2 border-dashed border-pw-text-dim bg-pw-surface-2/50" />
            <span className="text-sm text-pw-text-muted">Posizione aperta</span>
          </div>
        </div>
      </div>
    </div>
  );
}
