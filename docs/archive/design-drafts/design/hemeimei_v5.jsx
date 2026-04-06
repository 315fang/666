import { useState, useEffect, useRef } from "react";

const LAYERS = [
  {
    type: "single",
    title: "问兰药业",
    tag: "苏州河海大学企业",
    lines: ["50年药研传承", "美容院原料供应商", "烧伤科用了50年的配方\n护肤，只是我们的基本功"],
    en: "WENLAN PHARMACEUTICAL",
  },
  {
    type: "single",
    title: "镜像案例库",
    tag: "大学生成长平台",
    lines: ["社会第一课", "学校最后一堂课"],
    en: "JINGXIANG CASE LIBRARY",
  },
  {
    type: "reveal",
    title: "盒美美",
    sub: "做大学生的第一款护肤品",
    credit: "问兰药业 × 镜像案例库 · 联合出品",
    en: "HEMEIMEI",
  },
];

// ── 颜色系统：全程连续插值，无断崖 ──────────────────────
// 用三个关键色，globalP 0→1 线性映射
// 0.0: 深紫  0.5: 薰衣草紫  1.0: 米白
const GRAD = [
  { at: 0.00, c: [38,  6,  80] },
  { at: 0.25, c: [72, 30, 120] },
  { at: 0.50, c: [140,100,185] },
  { at: 0.72, c: [210,185,230] },
  { at: 1.00, c: [247,244,239] },
];

function sampleColor(p) {
  p = Math.max(0, Math.min(1, p));
  for (let i = 1; i < GRAD.length; i++) {
    if (p <= GRAD[i].at) {
      const prev = GRAD[i-1];
      const next = GRAD[i];
      const t = (p - prev.at) / (next.at - prev.at);
      const ease = t < 0.5 ? 2*t*t : -1+(4-2*t)*t; // easeInOut
      return prev.c.map((v,j) => Math.round(v + (next.c[j]-v)*ease));
    }
  }
  return GRAD[GRAD.length-1].c;
}
function rgb(c) { return `rgb(${c[0]},${c[1]},${c[2]})`; }

// 根据进度决定文字颜色
function getTextCol(p) {
  if (p < 0.55) return "#FFFFFF";
  const t = (p - 0.55) / 0.45;
  return `rgb(${Math.round(255-t*210)},${Math.round(255-t*228)},${Math.round(255-t*194)})`;
}
function getSubCol(p) {
  if (p < 0.55) return "rgba(255,255,255,0.5)";
  return `rgba(60,20,100,${0.45 + (p-0.55)*0.3})`;
}
function getArrowCol(p) {
  if (p < 0.45) return "rgba(255,255,255,0.35)";
  return `rgba(120,70,180,0.4)`;
}

export default function App() {
  const TOTAL  = 3;
  const STEP   = 1 / TOTAL;
  const THRESH = 0.30;

  const [phase,    setPhase]    = useState("flood");
  const [floodP,   setFloodP]   = useState(0);
  const [globalP,  setGlobalP]  = useState(0);
  const [layer,    setLayer]    = useState(0);
  const [wordAnim, setWordAnim] = useState("idle");
  const [showHome, setShowHome] = useState(false);

  const dragY     = useRef(null);
  const baseP     = useRef(0);
  const liveP     = useRef(0);
  const snapping  = useRef(false);
  const transit   = useRef(false);
  const raf       = useRef(null);
  const wt        = useRef(null);

  // ── 潮水涌入（简化：纯颜色从米白渐变到深紫，无波浪形状）──
  useEffect(() => {
    if (phase !== "flood") return;
    let t0 = null;
    const tick = ts => {
      if (!t0) t0 = ts;
      const t = Math.min((ts - t0) / 1800, 1);
      // easeOutCubic
      setFloodP(1 - Math.pow(1-t, 3));
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else setTimeout(() => { setPhase("interact"); wordIn(0); }, 200);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [phase]);

  const wordIn = idx => {
    setLayer(idx);
    setWordAnim("in");
    clearTimeout(wt.current);
    wt.current = setTimeout(() => setWordAnim("hold"), 540);
  };
  const wordOut = cb => {
    setWordAnim("out");
    clearTimeout(wt.current);
    wt.current = setTimeout(cb, 300);
  };

  const snapTo = (from, to, done) => {
    snapping.current = true;
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const go = ts => {
      const t = Math.min((ts-t0)/460, 1);
      const e = 1 - Math.pow(1-t, 3);
      const p = from + (to-from)*e;
      liveP.current = p;
      setGlobalP(p);
      if (t < 1) raf.current = requestAnimationFrame(go);
      else { snapping.current = false; done && done(); }
    };
    raf.current = requestAnimationFrame(go);
  };

  const advance = next => {
    transit.current = true;
    wordOut(() => {
      if (next >= TOTAL) { doReveal(); return; }
      wordIn(next);
      transit.current = false;
    });
  };

  const doReveal = () => {
    setLayer(TOTAL-1);
    wordIn(TOTAL-1);
    setTimeout(() => setShowHome(true), 1400);
  };

  const onStart = y => {
    if (phase !== "interact" || snapping.current || transit.current) return;
    dragY.current = y;
    baseP.current = liveP.current;
  };

  const onMove = y => {
    if (dragY.current === null || snapping.current) return;
    const delta = dragY.current - y;
    if (delta < 0) {
      liveP.current = Math.max(0, baseP.current + delta * 0.02);
      setGlobalP(liveP.current); return;
    }
    const p = Math.min(baseP.current + (delta/260)*STEP, 1);
    liveP.current = p; setGlobalP(p);
    const nl = Math.min(Math.floor(p/STEP), TOTAL-1);
    if (nl > layer && !transit.current) advance(nl);
    if (p >= 1 && !transit.current) {
      dragY.current = null; transit.current = true;
      wordOut(() => doReveal());
    }
  };

  const onEnd = () => {
    if (dragY.current === null) return;
    dragY.current = null;
    if (snapping.current || transit.current) return;
    const base = layer * STEP;
    const inL  = (liveP.current - base) / STEP;
    if (inL >= THRESH) {
      snapTo(liveP.current, Math.min((layer+1)*STEP, 1), () => {
        if (layer+1 >= TOTAL) { doReveal(); return; }
        advance(layer+1);
      });
    } else {
      snapTo(liveP.current, base, null);
    }
  };

  // 背景色：flood阶段从米白插值到深紫，interact阶段跟globalP走
  const bgColor = phase === "flood"
    ? rgb(sampleColor(floodP * 0.05)) // 只走到深紫就停
    : rgb(sampleColor(globalP));

  // flood阶段用全屏遮罩模拟涌入
  const floodOverlay = phase === "flood" ? rgb(sampleColor(0)) : null;

  const inLp    = Math.max(0, (globalP - layer*STEP) / STEP);
  const arrowA  = Math.max(0, 1 - inLp*4);
  const cur     = LAYERS[Math.min(layer, TOTAL-1)];
  const isReveal = cur?.type === "reveal";
  const tc      = getTextCol(globalP);
  const sc      = getSubCol(globalP);
  const ac      = getArrowCol(globalP);

  // 词动画样式
  const WS = {
    idle: { opacity:0,  transform:"translateY(28px) scale(1.08)", filter:"blur(12px)", transition:"none" },
    in:   { opacity:1,  transform:"translateY(0) scale(1)",       filter:"blur(0)",
            transition:"opacity 0.52s cubic-bezier(0.16,1,0.3,1), transform 0.52s cubic-bezier(0.16,1,0.3,1), filter 0.48s ease" },
    hold: { opacity:1,  transform:"translateY(0) scale(1)",       filter:"blur(0)" },
    out:  { opacity:0,  transform:"translateY(-24px) scale(0.93)", filter:"blur(8px)",
            transition:"opacity 0.28s ease, transform 0.28s ease, filter 0.28s ease" },
  }[wordAnim];

  if (showHome) return <HomePage />;

  return (
    <div
      onTouchStart={e => onStart(e.touches[0].clientY)}
      onTouchMove={e => { e.preventDefault(); onMove(e.touches[0].clientY); }}
      onTouchEnd={onEnd}
      onMouseDown={e => onStart(e.clientY)}
      onMouseMove={e => { if (dragY.current !== null) onMove(e.clientY); }}
      onMouseUp={onEnd}
      style={{
        width:"100%", maxWidth:"390px", height:"100vh",
        margin:"0 auto", overflow:"hidden",
        background: bgColor,
        position:"relative", userSelect:"none", touchAction:"none",
        cursor: phase==="interact" ? "ns-resize" : "default",
        // 背景色本身做过渡（flood阶段）
        transition: phase==="flood" ? "background 0.05s" : "none",
      }}>

      {/* flood: 深紫遮罩从底部涌入（纯色，无波浪）*/}
      {phase === "flood" && (
        <div style={{
          position:"absolute", bottom:0, left:0, right:0,
          height:`${floodP*100}%`,
          background: `linear-gradient(to top, ${rgb(sampleColor(0))}, ${rgb(sampleColor(0.08))})`,
          // 顶部轻微椭圆，比波浪更克制
          borderRadius: floodP < 0.96 ? "50% 50% 0 0 / 16px 16px 0 0" : "0",
          transition:"border-radius 0.6s ease",
        }}>
          {/* 顶部高光线 */}
          <div style={{
            position:"absolute", top:0, left:"25%", right:"25%", height:"1px",
            background:"rgba(180,130,255,0.25)",
            opacity: floodP < 0.92 ? 1 : 0, transition:"opacity 0.4s",
          }}/>
        </div>
      )}

      {/* interact: 手指联动 - 下一层颜色从底部涌出（纯色渐变，无波浪）*/}
      {phase === "interact" && inLp > 0.008 && (
        <div style={{
          position:"absolute", bottom:0, left:0, right:0,
          height:`${Math.min(inLp,1)*100}%`,
          background: rgb(sampleColor(Math.min((layer+1)*STEP, 1))),
          borderRadius: inLp < 0.9 ? "52% 48% 0 0 / 18px 14px 0 0" : "0",
          transition: snapping.current
            ? "height 0.46s cubic-bezier(0.16,1,0.3,1), border-radius 0.2s"
            : "border-radius 0.1s",
          pointerEvents:"none",
        }}>
          {/* 边缘光晕 */}
          <div style={{
            position:"absolute", top:0, left:"15%", right:"15%", height:"1px",
            background:"rgba(255,255,255,0.12)",
            opacity: inLp < 0.85 ? 1 : 0,
          }}/>
        </div>
      )}

      {/* 中央内容 */}
      <div style={{
        position:"absolute", inset:0,
        display:"flex", flexDirection:"column",
        alignItems:"center", justifyContent:"center",
        pointerEvents:"none",
      }}>

        {/* 顶部小标 */}
        {phase === "interact" && !isReveal && (
          <div style={{
            position:"absolute", top:"14%", textAlign:"center",
            opacity: 1, transition:"opacity 0.5s",
          }}>
            <div style={{
              fontSize:"9px", letterSpacing:"0.32em", textTransform:"uppercase",
              color: globalP < 0.4 ? "rgba(255,255,255,0.25)" : "rgba(180,140,220,0.35)",
              transition:"color 0.5s",
            }}>HEMEIMEI · 盒美美</div>
          </div>
        )}

        {/* 关键词内容 */}
        {phase === "interact" && cur && (
          <div style={{
            textAlign:"center", padding:"0 40px", width:"100%",
            marginTop: isReveal ? "0" : "32px",
            ...WS,
          }}>

            {/* Single层 */}
            {cur.type === "single" && (
              <>
                <div style={{
                  fontSize:"9px", letterSpacing:"0.3em", textTransform:"uppercase",
                  color: globalP < 0.45 ? "rgba(255,255,255,0.25)" : "rgba(180,140,220,0.35)",
                  marginBottom:"20px", transition:"color 0.4s",
                }}>
                  {cur.en}
                </div>

                {/* 标签 */}
                <div style={{
                  display:"inline-block",
                  border:`1px solid ${globalP<0.45?"rgba(255,255,255,0.2)":"rgba(150,100,200,0.3)"}`,
                  borderRadius:"100px", padding:"4px 14px",
                  fontSize:"10px", letterSpacing:"0.12em",
                  color: globalP<0.45 ? "rgba(255,255,255,0.45)" : "rgba(130,80,180,0.55)",
                  marginBottom:"16px", transition:"all 0.4s",
                }}>
                  {cur.tag}
                </div>

                {/* 主标题 */}
                <div style={{
                  fontSize:"34px", fontWeight:"800",
                  color: tc, lineHeight:1.1,
                  marginBottom:"20px", letterSpacing:"0.04em",
                  transition:"color 0.3s",
                }}>
                  {cur.title}
                </div>

                {/* 分割线 */}
                <div style={{
                  width:"24px", height:"1px", margin:"0 auto 18px",
                  background: globalP<0.45 ? "rgba(255,255,255,0.25)" : "rgba(150,100,200,0.3)",
                  transition:"background 0.4s",
                }}/>

                {/* 描述行 */}
                {cur.lines.map((line, i) => (
                  <div key={i} style={{
                    fontSize:"13px", color: sc,
                    lineHeight:1.9, letterSpacing:"0.08em",
                    whiteSpace:"pre-line",
                    transition:"color 0.3s",
                  }}>
                    {line}
                  </div>
                ))}
              </>
            )}

            {/* Reveal层 */}
            {cur.type === "reveal" && (
              <div style={{ textAlign:"center" }}>
                <div style={{
                  fontSize:"9px", letterSpacing:"0.32em", color:"rgba(80,40,120,0.38)",
                  textTransform:"uppercase", marginBottom:"22px",
                }}>
                  {cur.en}
                </div>
                <div style={{
                  fontSize:"60px", fontWeight:"900",
                  color:"#2D1A4A", letterSpacing:"0.05em",
                  lineHeight:1, marginBottom:"12px",
                }}>
                  {cur.title}
                </div>
                <div style={{
                  fontSize:"10px", color:"rgba(80,40,120,0.36)",
                  letterSpacing:"0.2em", marginBottom:"20px",
                }}>
                  {cur.credit}
                </div>
                <div style={{ width:"26px", height:"1px", margin:"0 auto 18px", background:"rgba(120,80,160,0.2)" }}/>
                <div style={{
                  fontSize:"16px", fontWeight:"500",
                  color:"rgba(45,26,74,0.7)",
                  lineHeight:1.8, letterSpacing:"0.06em",
                }}>
                  {cur.sub}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 进度点 */}
        {phase === "interact" && !isReveal && (
          <div style={{ position:"absolute", bottom:"108px", display:"flex", gap:"8px" }}>
            {[0,1].map(i => (
              <div key={i} style={{
                height:"2px",
                width: i===layer ? "20px" : "5px",
                borderRadius:"2px",
                background: globalP<0.45
                  ? (i<=layer?"rgba(255,255,255,0.55)":"rgba(255,255,255,0.15)")
                  : (i<=layer?"rgba(140,90,200,0.6)":"rgba(140,90,200,0.15)"),
                transition:"all 0.3s cubic-bezier(0.16,1,0.3,1)",
              }}/>
            ))}
          </div>
        )}
      </div>

      {/* 箭头 */}
      {phase === "interact" && !isReveal && (
        <div style={{
          position:"absolute", bottom:"48px", left:"50%", transform:"translateX(-50%)",
          opacity: arrowA,
          transition: snapping.current ? "opacity 0.3s" : "none",
          pointerEvents:"none",
          display:"flex", flexDirection:"column", alignItems:"center", gap:"3px",
        }}>
          <span style={{
            fontSize:"9px", letterSpacing:"0.25em", color:ac,
            fontFamily:"'PingFang SC',sans-serif", marginBottom:"4px",
          }}>下滑</span>
          {[0,1,2].map(i => (
            <div key={i} style={{
              width:"1.5px", height:"7px", borderRadius:"1px",
              background:ac, animation:`drop 1.5s ease-in-out ${i*0.16}s infinite`,
            }}/>
          ))}
          <svg width="14" height="9" viewBox="0 0 14 9" fill="none">
            <path d="M1 1L7 7.5L13 1" stroke={ac} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      )}

      <style>{`
        @keyframes drop {
          0%,100%{transform:translateY(0);opacity:.8}
          50%{transform:translateY(5px);opacity:.15}
        }
      `}</style>
    </div>
  );
}

// ── 首页 ─────────────────────────────────────────────────
function HomePage() {
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), 80); }, []);

  const products = [
    {id:1,name:"抗皱保湿精华液",tag:"美容院同款",price:"299",bg:"#EAF2E8",accent:"#6A9E62"},
    {id:2,name:"清爽控油洁面膏",tag:"新手必备",  price:"128",bg:"#E8EFF5",accent:"#5A7EA0"},
    {id:3,name:"屏障修护面霜",  tag:"敏感首选",  price:"199",bg:"#F5EEE8",accent:"#A07A5A"},
  ];

  return (
    <div style={{
      fontFamily:"'PingFang SC','Noto Sans SC',sans-serif",
      background:"#F7F4EF", minHeight:"100vh",
      maxWidth:"390px", margin:"0 auto", paddingBottom:"88px",
    }}>
      <div style={{
        padding:"20px 28px 14px", display:"flex", alignItems:"center",
        justifyContent:"space-between", position:"sticky", top:0, zIndex:30,
        background:"rgba(247,244,239,0.92)", backdropFilter:"blur(14px)",
      }}>
        <div>
          <div style={{ fontSize:"18px", fontWeight:"800", letterSpacing:"0.1em", color:"#2D2D2D" }}>盒美美</div>
          <div style={{ fontSize:"9px", color:"#BBBBBB", letterSpacing:"0.1em" }}>问兰药业 × 镜像案例库</div>
        </div>
        <div style={{ display:"flex", gap:"18px" }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" strokeWidth="1.6" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2D2D2D" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
        </div>
      </div>

      <div style={{
        margin:"8px 18px 0",
        background:"linear-gradient(155deg,#C2D9BC,#8AB586)",
        borderRadius:"28px", padding:"44px 32px 40px",
        position:"relative", overflow:"hidden",
        opacity:vis?1:0, transform:vis?"translateY(0)":"translateY(20px)",
        transition:"all 0.7s cubic-bezier(0.16,1,0.3,1)",
      }}>
        <div style={{ position:"absolute", right:-40, top:-40, width:180, height:180, background:"rgba(255,255,255,0.10)", borderRadius:"50%" }}/>
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ fontSize:"10px", letterSpacing:"0.2em", color:"rgba(255,255,255,0.7)", textTransform:"uppercase", marginBottom:"16px" }}>
            美容院原料供应商 · 50年
          </div>
          <div style={{ fontSize:"15px", fontWeight:"300", color:"rgba(255,255,255,0.9)", marginBottom:"6px" }}>
            美容院里那瓶不外卖的，
          </div>
          <div style={{ fontSize:"28px", fontWeight:"700", color:"#fff", lineHeight:1.25, marginBottom:"28px" }}>
            我们直接卖给你。
          </div>
          <button style={{
            background:"#fff", border:"none", borderRadius:"100px",
            padding:"13px 30px", fontSize:"14px", fontWeight:"600", color:"#5A8A54",
            cursor:"pointer", display:"inline-flex", alignItems:"center", gap:"8px",
            boxShadow:"0 8px 28px rgba(0,0,0,0.14)",
          }}>
            找到我的护肤方案
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#5A8A54" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>

      <div style={{ padding:"24px 18px 0", display:"flex", flexDirection:"column", gap:"14px" }}>
        {products.map((p,i) => (
          <div key={p.id} style={{
            background:"#fff", borderRadius:"20px", overflow:"hidden",
            boxShadow:"0 2px 16px rgba(0,0,0,0.05)", display:"flex", alignItems:"center",
            opacity:vis?1:0, transform:vis?"translateY(0)":"translateY(24px)",
            transition:`all 0.6s cubic-bezier(0.16,1,0.3,1) ${0.15+i*0.1}s`,
          }}>
            <div style={{ width:"96px", height:"96px", background:p.bg, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ width:"28px", height:"56px", background:`${p.accent}55`, borderRadius:"14px" }}/>
            </div>
            <div style={{ padding:"16px", flex:1 }}>
              <div style={{ fontSize:"10px", color:p.accent, fontWeight:"600", letterSpacing:"0.1em", marginBottom:"4px" }}>{p.tag}</div>
              <div style={{ fontSize:"15px", fontWeight:"700", color:"#2D2D2D", marginBottom:"10px" }}>{p.name}</div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ fontSize:"18px", fontWeight:"700", color:"#2D2D2D" }}>¥{p.price}</span>
                <button style={{
                  background:"#2D2D2D", border:"none", borderRadius:"100px",
                  padding:"8px 16px", fontSize:"12px", fontWeight:"600", color:"#fff", cursor:"pointer",
                }}>加入购物车</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)",
        width:"390px", background:"rgba(247,244,239,0.94)",
        backdropFilter:"blur(16px)", borderTop:"1px solid rgba(0,0,0,0.05)",
        display:"flex", padding:"14px 0 26px", zIndex:30,
      }}>
        {["首页","商品","活动","我的"].map((label,i) => (
          <div key={label} style={{
            flex:1, textAlign:"center", cursor:"pointer",
            fontSize:"11px", letterSpacing:"0.04em",
            color:i===0?"#A8C5A0":"#BBBBBB",
            fontWeight:i===0?"600":"400",
          }}>{label}</div>
        ))}
      </div>
    </div>
  );
}
