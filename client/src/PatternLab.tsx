import { useEffect, useState, useRef, useMemo } from "react";
import ForceGraph2D, { ForceGraphMethods } from "react-force-graph-2d";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import "./PatternLab.css";

type Node = {
  id: string;
  label: string;
  group: number;
  val: number;
  x?: number;
  y?: number;
};

type Link = {
  source: string | Node;
  target: string | Node;
};

type NetworkData = {
  nodes: Node[];
  links: Link[];
};

export default function PatternLab() {
  const [data, setData] = useState<NetworkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hoverNode, setHoverNode] = useState<Node | null>(null);
  const graphRef = useRef<ForceGraphMethods>();
  
  // Container dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    fetch("/api/analytics/network")
      .then((res) => res.json())
      .then((resData) => {
        if (resData.nodes && resData.nodes.length > 0) {
          setData(resData);
        } else {
          setData(null);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Compute graph statistics
  const stats = useMemo(() => {
    if (!data) return null;
    const cases = data.nodes.filter(n => n.group === 1).length;
    const persons = data.nodes.filter(n => n.group === 2).length;
    const locations = data.nodes.filter(n => n.group === 3).length;
    const crimes = data.nodes.filter(n => n.group === 4).length;

    // Top connected nodes
    const linkCounts: Record<string, number> = {};
    data.links.forEach(l => {
      const srcId = typeof l.source === "object" ? l.source.id : l.source;
      const tgtId = typeof l.target === "object" ? l.target.id : l.target;
      linkCounts[srcId] = (linkCounts[srcId] || 0) + 1;
      linkCounts[tgtId] = (linkCounts[tgtId] || 0) + 1;
    });

    const topEntities = data.nodes
      .filter(n => n.group === 2 || n.group === 3) // Persons or Locations
      .map(n => ({ ...n, connections: linkCounts[n.id] || 0 }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 5);

    return { cases, persons, locations, crimes, topEntities };
  }, [data]);

  const getNodeColor = (node: Node) => {
    switch (node.group) {
      case 1: return "#52dfc0"; // Case
      case 2: return "#ff5d73"; // Person
      case 3: return "#ffb454"; // Location
      case 4: return "#8e7dff"; // Crime
      default: return "#ffffff";
    }
  };

  if (loading) {
    return (
      <div className="pattern-lab-container">
        <div className="graph-area"><div className="empty-state">Loading pattern engine...</div></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="pattern-lab-container">
        <div className="graph-area">
          <div className="empty-state">
            <span>⌁</span>
            <h3>No Patterns Detected</h3>
            <p>Upload a dataset in the Case Vault first to map entity relationships.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pattern-lab-container">
      {/* ── Graph Area ────────────────────────────────────────────────────────── */}
      <div className="graph-area">
        <div className="graph-header">
          <div>
            <h3>Entity Relationship Network</h3>
            <p>Interactive 2D simulation of cases, suspects, and crime hubs.</p>
          </div>
          <div className="graph-legend">
            <span className="legend-item"><div className="legend-dot case" /> Cases</span>
            <span className="legend-item"><div className="legend-dot person" /> People</span>
            <span className="legend-item"><div className="legend-dot location" /> Locations</span>
            <span className="legend-item"><div className="legend-dot crime" /> Types</span>
          </div>
        </div>

        <div className="force-graph-wrapper" ref={containerRef}>
          <ForceGraph2D
            ref={graphRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={data}
            nodeLabel="" // using custom tooltip
            nodeColor={getNodeColor}
            nodeVal={(node: Node) => Math.sqrt(node.val) * 2 + 2} // size scaling
            linkColor={() => "rgba(82,223,192,0.15)"}
            linkWidth={1}
            onNodeHover={(node: Node | null) => setHoverNode(node)}
            backgroundColor="transparent"
            d3AlphaDecay={0.05}
            d3VelocityDecay={0.15}
            onEngineStop={() => {
               if (graphRef.current) graphRef.current.zoomToFit(400, 20);
            }}
          />
          {hoverNode && (
            <div className="node-tooltip" style={{ left: hoverNode.x ? hoverNode.x + dimensions.width/2 : 0, top: hoverNode.y ? hoverNode.y + dimensions.height/2 : 0 }}>
              <strong>{hoverNode.label}</strong>
              <br />
              <small>Connections: {hoverNode.val}</small>
            </div>
          )}
        </div>
      </div>

      {/* ── Sidebar Analytics ─────────────────────────────────────────────────── */}
      <aside className="analysis-sidebar">
        <div className="analysis-card">
          <h4><i>◈</i> Network Metrics</h4>
          <div className="stat-row"><span>Total Nodes</span><strong>{data.nodes.length}</strong></div>
          <div className="stat-row"><span>Total Edges</span><strong>{data.links.length}</strong></div>
          <div className="stat-row"><span>Cases Mapped</span><strong>{stats?.cases}</strong></div>
          <div className="stat-row"><span>Persons Mapped</span><strong>{stats?.persons}</strong></div>
          <div className="stat-row"><span>Locations Mapped</span><strong>{stats?.locations}</strong></div>
        </div>

        <div className="analysis-card">
          <h4><i>⌁</i> Top Connected Entities</h4>
          <p style={{ fontSize: 12, color: "rgba(154,177,206,0.8)", marginBottom: 12 }}>
            Nodes with the highest number of direct relationships (hubs).
          </p>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.topEntities || []} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis dataKey="label" type="category" width={100} tick={{ fontSize: 11, fill: "rgba(154,177,206,0.9)" }} axisLine={false} tickLine={false} />
                <RechartsTooltip 
                  cursor={{ fill: "rgba(82,223,192,0.1)" }}
                  contentStyle={{ backgroundColor: "rgba(10,20,42,0.9)", border: "1px solid rgba(82,223,192,0.3)", borderRadius: "8px", color: "#fff", fontSize: 12 }}
                  itemStyle={{ color: "#52dfc0" }}
                />
                <Bar dataKey="connections" radius={[0, 4, 4, 0]}>
                  {stats?.topEntities.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getNodeColor(entry)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </aside>
    </div>
  );
}
