import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('production ECS SSM least-privilege policy', () => {
  it('allows only parameter ARNs referenced by WebTask and OperationsTask', () => {
    const templatePath = fileURLToPath(new URL('../../infra/aws/ticket-production.json', import.meta.url));
    const template = JSON.parse(readFileSync(templatePath, 'utf8')) as {
      Resources: Record<string, {
        Properties: {
          ContainerDefinitions?: Array<{ Secrets?: Array<{ ValueFrom?: { 'Fn::Sub'?: string } }> }>;
          Policies?: Array<{ PolicyDocument?: { Statement?: Array<{ Resource?: Array<{ 'Fn::Sub'?: string }> }> } }>;
        };
      }>;
    };
    const resources = template.Resources;
    const referencedParameters = ['WebTask', 'OperationsTask'].flatMap(task =>
      resources[task].Properties.ContainerDefinitions?.flatMap(container =>
        container.Secrets?.map(secret => secret.ValueFrom?.['Fn::Sub']).filter((value): value is string => Boolean(value)) ?? [],
      ) ?? [],
    );
    const policyResources = resources.WebExecutionRole.Properties.Policies?.[0].PolicyDocument?.Statement?.[0].Resource ?? [];
    const allowedParameters = policyResources.map(resource => resource['Fn::Sub']).filter((value): value is string => Boolean(value));

    expect(new Set(allowedParameters)).toEqual(new Set(referencedParameters));
    expect(allowedParameters.some(resource => resource.includes('*'))).toBe(false);
  });
});
