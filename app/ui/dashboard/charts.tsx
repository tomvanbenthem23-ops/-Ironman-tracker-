'use client';

import { Bar, BarChart, Line, LineChart, ResponsiveContainer } from 'recharts';

/**
 * Minigrafiekjes: volle kaartbreedte, ~40px hoog, één kleur, geen assen,
 * geen raster, geen legenda. De betekenis staat in het bijschrift eronder.
 */

export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return <NoData>nog te weinig data voor een grafiek</NoData>;
  }
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="mt-1.5 h-[40px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
          <Line
            type="linear"
            dataKey="v"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars({ values, color }: { values: number[]; color: string }) {
  if (!values.some((v) => v > 0)) {
    return <NoData>nog geen afgeronde trainingen</NoData>;
  }
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="mt-1.5 h-[40px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 3, right: 2, bottom: 0, left: 2 }}>
          <Bar dataKey="v" fill={color} radius={[1.5, 1.5, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NoData({ children }: { children: React.ReactNode }) {
  return <div className="text-[.85rem] italic text-im-muted">{children}</div>;
}

export function Caption({ children }: { children: React.ReactNode }) {
  return <div className="text-[.68rem] text-im-muted">{children}</div>;
}
