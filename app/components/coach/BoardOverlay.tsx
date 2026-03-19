'use client'

import { useEffect, useState } from 'react'
import './board.css'

const PLAYER_COLORS: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', orange: '#f97316', white: '#d1d5db'
}

// From PyCatan/Visualizer/JS/general.js nodeCoordinates
const NODE_COORDS = [
  {top:'97px',left:'184px'},{top:'75px',left:'232px'},{top:'97px',left:'282px'},
  {top:'75px',left:'330px'},{top:'97px',left:'379px'},{top:'75px',left:'428px'},
  {top:'97px',left:'477px'},{top:'184px',left:'138px'},{top:'157px',left:'184px'},
  {top:'184px',left:'234px'},{top:'157px',left:'282px'},{top:'184px',left:'334px'},
  {top:'157px',left:'379px'},{top:'184px',left:'432px'},{top:'157px',left:'477px'},
  {top:'184px',left:'530px'},{top:'270px',left:'86px'},{top:'247px',left:'138px'},
  {top:'270px',left:'184px'},{top:'247px',left:'232px'},{top:'270px',left:'282px'},
  {top:'247px',left:'330px'},{top:'270px',left:'379px'},{top:'247px',left:'428px'},
  {top:'270px',left:'477px'},{top:'247px',left:'530px'},{top:'270px',left:'578px'},
  {top:'330px',left:'86px'},{top:'355px',left:'138px'},{top:'330px',left:'184px'},
  {top:'355px',left:'234px'},{top:'330px',left:'282px'},{top:'355px',left:'334px'},
  {top:'330px',left:'379px'},{top:'355px',left:'432px'},{top:'330px',left:'477px'},
  {top:'355px',left:'530px'},{top:'330px',left:'578px'},{top:'419px',left:'138px'},
  {top:'442px',left:'184px'},{top:'419px',left:'232px'},{top:'442px',left:'282px'},
  {top:'419px',left:'330px'},{top:'442px',left:'379px'},{top:'419px',left:'428px'},
  {top:'442px',left:'477px'},{top:'419px',left:'530px'},{top:'502px',left:'184px'},
  {top:'529px',left:'234px'},{top:'502px',left:'282px'},{top:'529px',left:'334px'},
  {top:'502px',left:'379px'},{top:'529px',left:'432px'},{top:'502px',left:'477px'},
]

// Terrain from game_0.json
const TERRAIN_DATA = [
  {id:0,type:'clay',prob:11},{id:1,type:'mineral',prob:12},{id:2,type:'wood',prob:9},
  {id:3,type:'cereal',prob:4},{id:4,type:'wool',prob:6},{id:5,type:'cereal',prob:5},
  {id:6,type:'mineral',prob:10},{id:7,type:'desert',prob:0},{id:8,type:'clay',prob:3},
  {id:9,type:'wood',prob:11},{id:10,type:'clay',prob:4},{id:11,type:'wood',prob:8},
  {id:12,type:'cereal',prob:8},{id:13,type:'mineral',prob:10},{id:14,type:'mineral',prob:9},
  {id:15,type:'wool',prob:3},{id:16,type:'wool',prob:5},{id:17,type:'wood',prob:2},
  {id:18,type:'clay',prob:6},
]

const CSS_CLASS: Record<string, string> = {
  wood:'terrain_wood', wool:'terrain_wool', cereal:'terrain_cereal',
  clay:'terrain_clay', mineral:'terrain_mineral', desert:'terrain_desert',
}

type Piece = { type: 'settlement' | 'city' | 'road'; color: string }

interface BoardOverlayProps {
  onClose: () => void
  onConfirm: (pieces: Record<string, Piece>) => void
}

export function BoardOverlay({ onClose, onConfirm }: BoardOverlayProps) {
  const [selColor, setSelColor] = useState<string>('red')
  const [selPiece, setSelPiece] = useState<'settlement' | 'city' | 'road'>('settlement')
  const [pieces, setPieces] = useState<Record<string, Piece>>({})

  // Set --s CSS variable on mount for mobile sizing
  useEffect(() => {
    const el = document.getElementById('catan-gamefield')
    if (el) el.style.setProperty('--s', '52px')
  }, [])

  function clickNode(id: number) {
    if (selPiece === 'road') return
    const k = `node_${id}`
    setPieces(p => {
      const next = { ...p }
      if (next[k]) delete next[k]
      else next[k] = { type: selPiece, color: selColor }
      return next
    })
  }

  function clickRoad(roadId: string) {
    if (selPiece !== 'road') return
    setPieces(p => {
      const next = { ...p }
      if (next[roadId]) delete next[roadId]
      else next[roadId] = { type: 'road', color: selColor }
      return next
    })
  }

  const pieceCount = Object.keys(pieces).length

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-stone-900">
      {/* Header */}
      <div className="bg-stone-800 border-b border-stone-700 px-4 py-3 flex items-center gap-3 shrink-0">
        <button onClick={onClose}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:bg-stone-700 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
        <div className="flex-1">
          <p className="text-stone-100 font-semibold text-sm">Tablero interactivo</p>
          <p className="text-stone-400 text-xs">Vértice → pueblo/ciudad · Arista → camino</p>
        </div>
      </div>

      {/* Player selector */}
      <div className="bg-stone-800 border-b border-stone-700 px-3 py-2 flex items-center gap-2 flex-shrink-0 overflow-x-auto">
        <span className="text-stone-500 text-xs flex-shrink-0">Jugador:</span>
        {(['red','blue','orange','white'] as const).map((c, i) => (
          <button key={c} onClick={() => setSelColor(c)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-bold flex-shrink-0 transition-all ${
              selColor === c ? 'border-current bg-current/10' : 'border-stone-600 text-stone-400'
            }`}
            style={{ color: selColor === c ? PLAYER_COLORS[c] : undefined,
                     borderColor: selColor === c ? PLAYER_COLORS[c] : undefined }}>
            <div className="w-2 h-2 rounded-full" style={{ background: PLAYER_COLORS[c] }} />
            {['Tú','J2','J3','J4'][i]}
          </button>
        ))}
      </div>

      {/* Piece selector */}
      <div className="bg-stone-800 border-b border-stone-700 px-3 py-2 flex items-center gap-2 flex-shrink-0">
        {([
          { key: 'settlement', label: 'Pueblo' },
          { key: 'city',       label: 'Ciudad' },
          { key: 'road',       label: 'Camino' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setSelPiece(key)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
              selPiece === key
                ? 'border-amber-500 text-amber-400 bg-amber-500/10'
                : 'border-stone-600 text-stone-400 bg-stone-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto flex items-center justify-center"
        style={{ background: '#1a2744' }}>
        <div id="catan-gamefield" className="gamefield" style={{ '--s': '52px' } as React.CSSProperties}>

          {/* Nodes layer */}
          <div className="nodes" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10 }}>
            {NODE_COORDS.map((c, i) => {
              const piece = pieces[`node_${i}`]
              const col = piece ? PLAYER_COLORS[piece.color] : undefined
              return (
                <div key={i} id={`node_${i}`}
                  className="node filler_node"
                  style={{
                    top: c.top, left: c.left,
                    cursor: selPiece !== 'road' ? 'pointer' : 'default',
                    background: col || undefined,
                    borderRadius: piece?.type === 'city' ? '3px' : '50%',
                    transform: piece ? 'scale(1.3)' : undefined,
                    zIndex: piece ? 5 : undefined,
                  }}
                  onClick={() => clickNode(i)}
                />
              )
            })}
          </div>

          {/* Roads */}
          <div className="roads" id="roads-layer">
            {[
              ['road_0_1','first_row third_col left_road'],
              ['road_1_2','first_row fourth_col right_road'],
              ['road_2_3','first_row fifth_col left_road'],
              ['road_3_4','first_row sixth_col right_road'],
              ['road_4_5','first_row seventh_col left_road'],
              ['road_5_6','first_row eighth_col right_road'],
              ['road_0_8','vertical_road vertical_first_row vertical_third_col'],
              ['road_2_10','vertical_road vertical_first_row vertical_fifth_col'],
              ['road_4_12','vertical_road vertical_first_row vertical_seventh_col'],
              ['road_6_14','vertical_road vertical_first_row vertical_ninth_col'],
              ['road_7_8','second_row second_col left_road'],
              ['road_8_9','second_row third_col right_road'],
              ['road_9_10','second_row fourth_col left_road'],
              ['road_10_11','second_row fifth_col right_road'],
              ['road_11_12','second_row sixth_col left_road'],
              ['road_12_13','second_row seventh_col right_road'],
              ['road_13_14','second_row eighth_col left_road'],
              ['road_14_15','second_row ninth_col right_road'],
              ['road_7_17','vertical_road vertical_second_row vertical_second_col'],
              ['road_9_19','vertical_road vertical_second_row vertical_fourth_col'],
              ['road_11_21','vertical_road vertical_second_row vertical_sixth_col'],
              ['road_13_23','vertical_road vertical_second_row vertical_eighth_col'],
              ['road_15_25','vertical_road vertical_second_row vertical_tenth_col'],
              ['road_16_17','third_row first_col left_road'],
              ['road_17_18','third_row second_col right_road'],
              ['road_18_19','third_row third_col left_road'],
              ['road_19_20','third_row fourth_col right_road'],
              ['road_20_21','third_row fifth_col left_road'],
              ['road_21_22','third_row sixth_col right_road'],
              ['road_22_23','third_row seventh_col left_road'],
              ['road_23_24','third_row eighth_col right_road'],
              ['road_24_25','third_row ninth_col left_road'],
              ['road_25_26','third_row tenth_col right_road'],
              ['road_16_27','vertical_road vertical_third_row vertical_first_col'],
              ['road_18_29','vertical_road vertical_third_row vertical_third_col'],
              ['road_20_31','vertical_road vertical_third_row vertical_fifth_col'],
              ['road_22_33','vertical_road vertical_third_row vertical_seventh_col'],
              ['road_24_35','vertical_road vertical_third_row vertical_ninth_col'],
              ['road_26_37','vertical_road vertical_third_row vertical_eleventh_col'],
              ['road_27_28','fourth_row first_col right_road'],
              ['road_28_29','fourth_row second_col left_road'],
              ['road_29_30','fourth_row third_col right_road'],
              ['road_30_31','fourth_row fourth_col left_road'],
              ['road_31_32','fourth_row fifth_col right_road'],
              ['road_32_33','fourth_row sixth_col left_road'],
              ['road_33_34','fourth_row seventh_col right_road'],
              ['road_34_35','fourth_row eighth_col left_road'],
              ['road_35_36','fourth_row ninth_col right_road'],
              ['road_36_37','fourth_row tenth_col left_road'],
              ['road_27_38','vertical_road vertical_fourth_row vertical_second_col'],
              ['road_29_40','vertical_road vertical_fourth_row vertical_fourth_col'],
              ['road_31_42','vertical_road vertical_fourth_row vertical_sixth_col'],
              ['road_33_44','vertical_road vertical_fourth_row vertical_eighth_col'],
              ['road_35_46','vertical_road vertical_fourth_row vertical_tenth_col'],
              ['road_38_39','fifth_row second_col right_road'],
              ['road_39_40','fifth_row third_col left_road'],
              ['road_40_41','fifth_row fourth_col right_road'],
              ['road_41_42','fifth_row fifth_col left_road'],
              ['road_42_43','fifth_row sixth_col right_road'],
              ['road_43_44','fifth_row seventh_col left_road'],
              ['road_44_45','fifth_row eighth_col right_road'],
              ['road_45_46','fifth_row ninth_col left_road'],
              ['road_39_47','vertical_road vertical_fifth_row vertical_third_col'],
              ['road_41_49','vertical_road vertical_fifth_row vertical_fifth_col'],
              ['road_43_51','vertical_road vertical_fifth_row vertical_seventh_col'],
              ['road_45_53','vertical_road vertical_fifth_row vertical_ninth_col'],
              ['road_47_48','sixth_row third_col left_road'],
              ['road_48_49','sixth_row fourth_col right_road'],
              ['road_49_50','sixth_row fifth_col left_road'],
              ['road_50_51','sixth_row sixth_col right_road'],
              ['road_51_52','sixth_row seventh_col left_road'],
              ['road_52_53','sixth_row eighth_col right_road'],
            ].map(([id, cls]) => {
              const piece = pieces[id]
              return (
                <div key={id} id={id} className={`road ${cls}`}
                  style={{
                    cursor: selPiece === 'road' ? 'pointer' : 'default',
                    background: piece ? PLAYER_COLORS[piece.color] : undefined,
                    opacity: piece ? 1 : undefined,
                  }}
                  onClick={() => clickRoad(id)}
                />
              )
            })}
          </div>

          {/* Terrain */}
          <div className="terrain_pieces" id="terrain_pieces">
            {/* Row 0: top fillers */}
            {Array(8).fill(0).map((_,i) => <div key={`t${i}`} className="terrain top_terrain"/>)}
            <br/>
            {/* Row 1: spacers + row1 terrains */}
            <div className="terrain"/><div className="terrain"/>
            {TERRAIN_DATA.slice(0,3).map(t => (
              <div key={t.id} id={`terrain_${t.id}`} className={`terrain ${CSS_CLASS[t.type]}`}>
                <div className="terrain_number">{t.prob > 0 && (
                  <span style={{
                    display:'inline-flex',alignItems:'center',justifyContent:'center',
                    width:20,height:20,borderRadius:'50%',
                    background:'rgba(255,255,255,0.9)',
                    fontSize:9,fontWeight:800,
                    color: t.prob===6||t.prob===8 ? '#dc2626' : '#1c1c1e',
                    boxShadow:'0 1px 3px rgba(0,0,0,0.3)',
                  }}>{t.prob}</span>
                )}</div>
              </div>
            ))}
            <div className="terrain"/><div className="terrain"/><br/>
            {/* Row 2 */}
            <div className="terrain"/><div className="terrain"/>
            {TERRAIN_DATA.slice(3,7).map(t => (
              <div key={t.id} id={`terrain_${t.id}`} className={`terrain ${CSS_CLASS[t.type]}`}>
                <div className="terrain_number">{t.prob > 0 && (
                  <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:'rgba(255,255,255,0.9)',fontSize:9,fontWeight:800,color:t.prob===6||t.prob===8?'#dc2626':'#1c1c1e',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}>{t.prob}</span>
                )}</div>
              </div>
            ))}
            <div className="terrain"/><div className="terrain"/><br/>
            {/* Row 3 (middle) */}
            <div className="terrain"/>
            {TERRAIN_DATA.slice(7,12).map(t => (
              <div key={t.id} id={`terrain_${t.id}`} className={`terrain ${CSS_CLASS[t.type]}`}>
                <div className="terrain_number">{t.prob > 0 ? (
                  <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:'rgba(255,255,255,0.9)',fontSize:9,fontWeight:800,color:t.prob===6||t.prob===8?'#dc2626':'#1c1c1e',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}>{t.prob}</span>
                ) : <span style={{fontSize:16}}>🏴</span>}</div>
              </div>
            ))}
            <div className="terrain"/><br/>
            {/* Row 4 */}
            <div className="terrain"/><div className="terrain"/>
            {TERRAIN_DATA.slice(12,16).map(t => (
              <div key={t.id} id={`terrain_${t.id}`} className={`terrain ${CSS_CLASS[t.type]}`}>
                <div className="terrain_number">{t.prob > 0 && (
                  <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:'rgba(255,255,255,0.9)',fontSize:9,fontWeight:800,color:t.prob===6||t.prob===8?'#dc2626':'#1c1c1e',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}>{t.prob}</span>
                )}</div>
              </div>
            ))}
            <div className="terrain"/><div className="terrain"/><br/>
            {/* Row 5 */}
            <div className="terrain"/><div className="terrain"/>
            {TERRAIN_DATA.slice(16,19).map(t => (
              <div key={t.id} id={`terrain_${t.id}`} className={`terrain ${CSS_CLASS[t.type]}`}>
                <div className="terrain_number">{t.prob > 0 && (
                  <span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:20,height:20,borderRadius:'50%',background:'rgba(255,255,255,0.9)',fontSize:9,fontWeight:800,color:t.prob===6||t.prob===8?'#dc2626':'#1c1c1e',boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}>{t.prob}</span>
                )}</div>
              </div>
            ))}
            <div className="terrain"/><div className="terrain"/><br/>
            {/* Bottom fillers */}
            {Array(8).fill(0).map((_,i) => <div key={`b${i}`} className="terrain bottom_terrain"/>)}
          </div>

        </div>
      </div>

      {/* Bottom bar */}
      <div className="bg-stone-800 border-t border-stone-700 px-4 py-3 flex gap-3 flex-shrink-0">
        <button onClick={() => setPieces({})}
          className="flex-1 py-2.5 rounded-xl border border-stone-600 bg-stone-700 text-stone-200 text-sm font-semibold">
          Limpiar
        </button>
        <button onClick={() => onConfirm(pieces)}
          className="flex-2 flex-[2] py-2.5 rounded-xl bg-amber-500 text-black text-sm font-bold transition-colors hover:bg-amber-400">
          Confirmar tablero {pieceCount > 0 && `(${pieceCount})`} →
        </button>
      </div>
    </div>
  )
}
