import { Module } from '@nestjs/common'
import { StartBuildModule } from '#src/app/build/use-cases/start-build/start-build.module.js'

@Module({ imports: [StartBuildModule] })
export class BuildModule {}
