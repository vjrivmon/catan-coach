/**
 * BoardRecommendationBuilder — CÓDIGO PURO, 0 LLM
 *
 * Genera BoardRecommendation desde GeneticResult + BoardContext.
 * NUNCA depende del LLM para emitir RECOMMENDATION_JSON.
 */

import type { BoardRecommendation } from '../domain/entities'
import type { BoardContext } from './BoardStateAgent'

export interface GeneticResult {
  action: string
  actionEs: string
  score: number
  reason: string
  alternatives: Array<{ action: string; actionEs: string; score: number; reason: string }>
  positionContext?: {
    mySettlements: string[]
    myRoads: string[]
    frontier: string[]
  }
}

const BUILD_ACTIONS: Record<string, 'road' | 'settlement' | 'city'> = {
  build_road: 'road',
  build_settlement: 'settlement',
  build_city: 'city',
}

const ACTION_ES: Record<string, string> = {
  build_settlement: 'Construir poblado',
  build_city:       'Construir ciudad',
  build_road:       'Construir camino',
  buy_dev_card:     'Comprar carta de desarrollo',
  trade:            'Comerciar',
  play_dev_card:    'Jugar carta de desarrollo',
  pass:             'Pasar turno',
}

/** Check if a build action is feasible with current resources */
function isActionFeasible(action: string, canBuild: BoardContext['canBuild']): boolean {
  switch (action) {
    case 'build_road':       return canBuild.road
    case 'build_settlement': return canBuild.settlement
    case 'build_city':       return canBuild.city
    case 'buy_dev_card':     return canBuild.devCard
    default:                 return true // pass, trade, play_dev_card are always feasible
  }
}

export interface BuilderResult {
  /** Board recommendation for the "Ver en tablero" button, or null if no physical action */
  boardRecommendation: BoardRecommendation | null
  /** Action translated to Spanish */
  actionEs: string
  /** Position description for the narrator */
  positionDescription: string
  /** Resource cost description */
  costDescription: string
  /** Whether the player can execute this action now */
  canExecute: boolean
  /** Reason from genetic agent */
  reason: string
}

const COST_MAP: Record<string, string> = {
  build_road:       '1 Madera + 1 Arcilla',
  build_settlement: '1 Madera + 1 Arcilla + 1 Lana + 1 Trigo',
  build_city:       '3 Mineral + 2 Trigo',
  buy_dev_card:     '1 Mineral + 1 Lana + 1 Trigo',
  pass:             'ninguno',
  trade:            'según intercambio',
}

/**
 * Build a recommendation from GeneticResult.
 * Returns null if no genetic result or no actionable recommendation.
 */
export function buildRecommendation(
  geneticResult: GeneticResult | null | undefined,
  boardContext: BoardContext
): BuilderResult {
  // Fallback: no genetic result → recommend pass
  if (!geneticResult) {
    return {
      boardRecommendation: null,
      actionEs: 'Pasar turno',
      positionDescription: '',
      costDescription: 'ninguno',
      canExecute: true,
      reason: 'No hay recomendación disponible del análisis estratégico.',
    }
  }

  const action = geneticResult.action
  const buildType = BUILD_ACTIONS[action]
  const canExecute = isActionFeasible(action, boardContext.canBuild)
  const actionEs = ACTION_ES[action] ?? geneticResult.actionEs ?? action

  // If the action is not feasible, check alternatives
  let effectiveAction = action
  let effectiveGenetic = geneticResult
  if (!canExecute && geneticResult.alternatives?.length > 0) {
    for (const alt of geneticResult.alternatives) {
      if (isActionFeasible(alt.action, boardContext.canBuild)) {
        effectiveAction = alt.action
        effectiveGenetic = { ...geneticResult, action: alt.action, actionEs: alt.actionEs, reason: alt.reason, score: alt.score }
        break
      }
    }
  }

  const effectiveBuildType = BUILD_ACTIONS[effectiveAction]
  const effectiveCanExecute = isActionFeasible(effectiveAction, boardContext.canBuild)
  const effectiveActionEs = ACTION_ES[effectiveAction] ?? effectiveGenetic.actionEs ?? effectiveAction

  // Build position description from frontier
  const pc = effectiveGenetic.positionContext
  let positionDescription = ''
  let boardRecommendation: BoardRecommendation | null = null

  if (effectiveBuildType && pc?.frontier && pc.frontier.length > 0) {
    const firstFrontier = pc.frontier[0]
    const posMatch = firstFrontier.match(/^(v\d+|e\d+_\d+)/)
    if (posMatch) {
      const label = firstFrontier.replace(/^(v\d+|e\d+_\d+)\s*/, '').slice(0, 60)
      positionDescription = label || firstFrontier
      boardRecommendation = {
        type: effectiveBuildType,
        position: posMatch[1],
        label,
      }
    }
  } else if (effectiveAction === 'build_city' && pc?.mySettlements && pc.mySettlements.length > 0) {
    // For cities, the position is an existing settlement
    const firstSettlement = pc.mySettlements[0]
    const posMatch = firstSettlement.match(/^(v\d+)/)
    if (posMatch) {
      const label = firstSettlement.replace(/^v\d+\s*/, '').slice(0, 60)
      positionDescription = label || firstSettlement
      boardRecommendation = {
        type: 'city',
        position: posMatch[1],
        label,
      }
    }
  }

  return {
    boardRecommendation,
    actionEs: effectiveActionEs,
    positionDescription,
    costDescription: COST_MAP[effectiveAction] ?? '',
    canExecute: effectiveCanExecute,
    reason: effectiveGenetic.reason,
  }
}
