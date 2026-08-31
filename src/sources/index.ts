import type { ISourceService } from '@/core/interfaces/ISourceService'
import { SOURCE_REGISTRY_KEY } from '@/core/interfaces/ISourceService'
import { RoyalRoadService } from './royalroad/RoyalRoadService'

/** Liste de tous les services sources disponibles */
export const sourceServices: ISourceService[] = [new RoyalRoadService()]

/** Résout le service correspondant à une URL donnée */
export function resolveService(url: string): ISourceService | null {
    return sourceServices.find(s => s.normalizeFictionUrl(url) !== null) ?? null
}

export { SOURCE_REGISTRY_KEY }
