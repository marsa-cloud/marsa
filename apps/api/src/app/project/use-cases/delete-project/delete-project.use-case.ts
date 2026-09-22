import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DeleteProjectRepository } from '#src/app/project/use-cases/delete-project/delete-project.repository.js'

@Injectable()
export class DeleteProjectUseCase {
  constructor(private readonly repository: DeleteProjectRepository) {}

  async execute(slug: string): Promise<void> {
    const outcome = await this.repository.delete(slug)
    if (outcome === 'not-found') {
      throw new NotFoundException(`Project '${slug}' was not found.`)
    }
    if (outcome === 'in-use') {
      throw new ConflictException(`Project '${slug}' still has environments. Delete them first.`)
    }
  }
}
