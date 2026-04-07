'use client';

export default function OrganigrammaPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-pw-text font-[var(--font-syne)]">Organigramma</h1>
        <p className="text-sm text-pw-text-muted">Struttura organizzativa PiraWeb Creative Agency</p>
      </div>

      {/* Chart */}
      <div className="bg-pw-surface rounded-2xl border border-pw-border p-4 sm:p-6 overflow-x-auto">
        <svg
          viewBox="0 0 760 430"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full"
          style={{ minWidth: 520 }}
        >
          <defs>
            {/* Unified marker: orient="auto-start-reverse" → works for both markerStart and markerEnd */}
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

          {/* Hierarchy: CEO → T-junction at y=122 → Bersin (left) + Sales (right) */}
          <line x1="450" y1="85" x2="450" y2="122" stroke="#6b7280" strokeWidth="1.5" />
          <line x1="280" y1="122" x2="655" y2="122" stroke="#6b7280" strokeWidth="1.5" />
          <line x1="280" y1="122" x2="280" y2="155" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#arr-gray)" />
          <line x1="655" y1="122" x2="655" y2="155" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#arr-gray)" />

          {/* Hierarchy: Bersin → T-junction at y=272 → Manuela (left) + Raffaela (center) */}
          <line x1="280" y1="227" x2="280" y2="272" stroke="#6b7280" strokeWidth="1.5" />
          <line x1="100" y1="272" x2="329" y2="272" stroke="#6b7280" strokeWidth="1.5" />
          <line x1="100" y1="272" x2="100" y2="330" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#arr-gray)" />
          <line x1="329" y1="272" x2="329" y2="330" stroke="#6b7280" strokeWidth="1.5" markerEnd="url(#arr-gray)" />

          {/* Red dashed: Bersin → Sales Account (task assignment, horizontal) */}
          <line x1="392" y1="192" x2="548" y2="192" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="7,4" markerEnd="url(#arr-red)" />

          {/* Red dashed: Bersin → Gaia (task assignment, curved) */}
          <path d="M 280 227 C 280 305 620 305 620 330" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="7,4" fill="none" markerEnd="url(#arr-red)" />

          {/* Blue dashed: CEO → Raffaela (Web Specialist, left wide arc) */}
          <path d="M 312 50 C 70 50 70 367 230 367" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="8,4" fill="none" markerEnd="url(#arr-blue)" />

          {/* Blue dashed: CEO → Gaia (Web Specialist, right wide arc) */}
          <path d="M 588 50 C 740 50 740 367 732 367" stroke="#818cf8" strokeWidth="1.5" strokeDasharray="8,4" fill="none" markerEnd="url(#arr-blue)" />

          {/* Green dashed bidirectional: Raffaela ↔ Gaia (collaboration) */}
          <line x1="428" y1="367" x2="508" y2="367" stroke="#34d399" strokeWidth="1.5" strokeDasharray="6,3" markerStart="url(#arr-green)" markerEnd="url(#arr-green)" />

          {/* ===== NODES (drawn last so they appear on top of lines) ===== */}

          {/* CEO — Raffaele Antonio Piccolo */}
          <rect x="310" y="15" width="280" height="70" rx="10" ry="10" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.5" />
          <text x="450" y="46" textAnchor="middle" fill="#a5b4fc" fontSize="14" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Raffaele Antonio Piccolo</text>
          <text x="450" y="64" textAnchor="middle" fill="#6366f1" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">CEO · Web Specialist · ADV · Fotografo</text>

          {/* Bersin Del Villano — Social Media Manager */}
          <rect x="170" y="157" width="220" height="70" rx="10" ry="10" fill="#431407" stroke="#fb923c" strokeWidth="1.5" />
          <text x="280" y="188" textAnchor="middle" fill="#fdba74" fontSize="13" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Bersin Del Villano</text>
          <text x="280" y="206" textAnchor="middle" fill="#ea580c" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">Social Media Manager</text>

          {/* Sales Account — Posizione aperta */}
          <rect x="550" y="157" width="210" height="70" rx="10" ry="10" fill="#111827" stroke="#6b7280" strokeWidth="1.5" strokeDasharray="8,4" />
          <text x="655" y="188" textAnchor="middle" fill="#9ca3af" fontSize="13" fontWeight="bold" fontStyle="italic" fontFamily="ui-sans-serif,system-ui,sans-serif">Sales Account</text>
          <text x="655" y="206" textAnchor="middle" fill="#6b7280" fontSize="11" fontStyle="italic" fontFamily="ui-sans-serif,system-ui,sans-serif">Posizione aperta</text>

          {/* Manuela Del Villano — Content Creator */}
          <rect x="5" y="330" width="190" height="70" rx="10" ry="10" fill="#042f2e" stroke="#2dd4bf" strokeWidth="1.5" />
          <text x="100" y="361" textAnchor="middle" fill="#5eead4" fontSize="12" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Manuela Del Villano</text>
          <text x="100" y="379" textAnchor="middle" fill="#0d9488" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">Content Creator</text>

          {/* Raffaela Sparaco — Graphic Design Social */}
          <rect x="232" y="330" width="195" height="70" rx="10" ry="10" fill="#042f2e" stroke="#2dd4bf" strokeWidth="1.5" />
          <text x="329" y="361" textAnchor="middle" fill="#5eead4" fontSize="12" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Raffaela Sparaco</text>
          <text x="329" y="379" textAnchor="middle" fill="#0d9488" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">Graphic Design Social</text>

          {/* Gaia Coppeto — Graphic Design UI/UX · Brand */}
          <rect x="510" y="330" width="220" height="70" rx="10" ry="10" fill="#042f2e" stroke="#2dd4bf" strokeWidth="1.5" />
          <text x="620" y="361" textAnchor="middle" fill="#5eead4" fontSize="12" fontWeight="bold" fontFamily="ui-sans-serif,system-ui,sans-serif">Gaia Coppeto</text>
          <text x="620" y="379" textAnchor="middle" fill="#0d9488" fontSize="11" fontFamily="ui-sans-serif,system-ui,sans-serif">Graphic Design UI/UX · Brand</text>
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
            <span className="text-sm text-pw-text-muted">Gerarchia diretta — riporta al CEO</span>
          </div>

          {/* Red dashed */}
          <div className="flex items-center gap-3">
            <div className="flex items-center shrink-0">
              <div className="w-8 h-0 border-t-2 border-dashed border-red-500" />
              <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid #ef4444' }} />
            </div>
            <span className="text-sm text-pw-text-muted">Assegna task — Social Media Manager (a tutti)</span>
          </div>

          {/* Blue dashed */}
          <div className="flex items-center gap-3">
            <div className="flex items-center shrink-0">
              <div className="w-8 h-0 border-t-2 border-dashed border-indigo-400" />
              <div style={{ width: 0, height: 0, borderTop: '5px solid transparent', borderBottom: '5px solid transparent', borderLeft: '7px solid #818cf8' }} />
            </div>
            <span className="text-sm text-pw-text-muted">Assegna task — Web Specialist (alle grafiche)</span>
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

          {/* Open position */}
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-10 h-6 rounded border-2 border-dashed border-gray-500 bg-gray-800/50" />
            <span className="text-sm text-pw-text-muted">Posizione aperta / da ricoprire</span>
          </div>

        </div>
      </div>
    </div>
  );
}
