import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { buildSync } from 'esbuild';

export interface NodejsHandlerProps {
  readonly functionName: string;
  /** Absolute path to the .ts handler file inside the Nx workspace. */
  readonly entry: string;
  /** Exported symbol from the handler module (e.g. 'handler'). */
  readonly handlerExport?: string;
  readonly memorySize?: number;
  readonly timeout?: cdk.Duration;
  readonly environment?: Record<string, string>;
  readonly minify?: boolean;
  readonly sourceMap?: boolean;
  readonly logRetention?: logs.RetentionDays;
  readonly logRemovalPolicy?: cdk.RemovalPolicy;
  /** Extra modules to mark external (already provided by the Lambda runtime). */
  readonly externalModules?: readonly string[];
}

/**
 * Bundles a TypeScript handler with esbuild's local API and produces a Lambda Function.
 *
 * We don't use `aws-lambda-nodejs.NodejsFunction` because it detects the workspace's
 * `pnpm-lock.yaml` and shells out to `pnpm exec -- esbuild …`. That subprocess pulls in
 * the user's corepack-managed pnpm shim, which on this dev machine re-execs with the
 * system Node 20 and crashes on `node:sqlite`. Calling esbuild's Node API directly from
 * infra/node_modules sidesteps the shim entirely, makes bundling deterministic in CI, and
 * keeps bundle config in code we own instead of CDK's package-manager heuristic.
 */
export class NodejsHandler extends Construct {
  readonly function: lambda.Function;
  readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: NodejsHandlerProps) {
    super(scope, id);

    const handlerExport = props.handlerExport ?? 'handler';
    const externalModules = props.externalModules ?? ['@aws-sdk/*'];

    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${props.functionName}`,
      retention: props.logRetention ?? logs.RetentionDays.TWO_WEEKS,
      removalPolicy: props.logRemovalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    this.function = new lambda.Function(this, 'Function', {
      functionName: props.functionName,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: props.memorySize ?? 256,
      timeout: props.timeout ?? cdk.Duration.seconds(10),
      logGroup: this.logGroup,
      environment: props.environment,
      handler: `index.${handlerExport}`,
      code: lambda.Code.fromAsset(path.dirname(props.entry), {
        // Use a content-addressed asset hash so identical bundles dedupe across deploys.
        assetHashType: cdk.AssetHashType.OUTPUT,
        bundling: {
          // Docker image is only consulted if local bundling returns false. We always
          // succeed locally, so this image is effectively unused — it just satisfies the
          // contract of CDK's Asset bundling API.
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          command: ['/bin/false'],
          local: {
            tryBundle: (outputDir: string): boolean => {
              buildSync({
                entryPoints: [props.entry],
                bundle: true,
                platform: 'node',
                target: 'node22',
                format: 'cjs',
                outfile: path.join(outputDir, 'index.js'),
                external: [...externalModules],
                minify: props.minify ?? false,
                sourcemap: props.sourceMap ?? true,
                logLevel: 'warning',
              });
              return true;
            },
          },
        },
      }),
    });
  }
}
