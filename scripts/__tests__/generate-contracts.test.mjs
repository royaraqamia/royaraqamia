import { describe, expect, it } from 'vitest';

import {
  camelCase,
  emitKotlin,
  enumConstantFor,
  pascalCase,
  propertyNameFor,
  renderKotlinFile,
  typeNameFor,
} from '../generate-contracts.mjs';

/**
 * The generator is the seam between one Zod contract and two clients
 * (ADR-0089, #648). These cases pin the decisions a schema change leans on:
 * an optional field must be optional in Kotlin, an enum must keep its wire
 * value, and a shape the generator cannot express must fail loudly instead of
 * reaching the app as `Any`.
 */
describe('naming', () => {
  it('turns a schema export into the type the app reads', () => {
    expect(typeNameFor('MyUsageResponseSchema')).toBe('MyUsageResponse');
    expect(typeNameFor('UsageCounterStatePayloadSchema')).toBe('UsageCounterStatePayload');
  });

  it('pascal-cases keys with separators', () => {
    expect(pascalCase('cover_image')).toBe('CoverImage');
    expect(pascalCase('state')).toBe('State');
    expect(camelCase('cover_image')).toBe('coverImage');
  });

  it('keeps a plain key and renames only what Kotlin cannot name', () => {
    expect(propertyNameFor('expiresAt')).toEqual({ name: 'expiresAt', renamed: false });
    // An underscore is legal in a Kotlin identifier, so the wire name stands.
    expect(propertyNameFor('cover_image')).toEqual({ name: 'cover_image', renamed: false });
    expect(propertyNameFor('content-type')).toEqual({ name: 'contentType', renamed: true });
    // A keyword is legal between backticks, so the wire name stays the same.
    expect(propertyNameFor('class')).toEqual({ name: '`class`', renamed: false });
  });

  it('upper-snakes an enum constant and keeps the wire value in an annotation', () => {
    expect(enumConstantFor('free')).toBe('FREE');
    expect(enumConstantFor('setExpiry')).toBe('SET_EXPIRY');
  });
});

describe('emitKotlin', () => {
  const object = (properties, required = Object.keys(properties)) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  });

  it('maps scalars, arrays and integers', () => {
    const { declarations } = emitKotlin(
      object({
        id: { type: 'string' },
        count: { type: 'integer' },
        ratio: { type: 'number' },
        ok: { type: 'boolean' },
        tags: { type: 'array', items: { type: 'string' } },
      }),
      'Sample'
    );

    expect(declarations).toEqual([
      [
        'class',
        'Sample',
        [
          '    val id: String,',
          '    val count: Long,',
          '    val ratio: Double,',
          '    val ok: Boolean,',
          '    val tags: List<String>,',
        ],
      ],
    ]);
  });

  it('makes a field the schema does not require nullable with a default', () => {
    const { declarations } = emitKotlin(
      object({ name: { type: 'string' }, note: { type: 'string' } }, ['name']),
      'Sample'
    );

    expect(declarations[0][2]).toEqual(['    val name: String,', '    val note: String? = null,']);
  });

  it('keeps a required field that the schema allows to be null non-defaulted', () => {
    const { declarations } = emitKotlin(
      object({ expiresAt: { type: ['string', 'null'] } }),
      'Sample'
    );

    expect(declarations[0][2]).toEqual(['    val expiresAt: String?,']);
  });

  it('names a nested object after its path so the app can read it', () => {
    const { declarations } = emitKotlin(
      object({
        state: object({ plan: { type: 'string', enum: ['free', 'pro'] } }),
      }),
      'MyUsageResponse'
    );

    expect(declarations.map(([kind, name]) => [kind, name])).toEqual([
      ['class', 'MyUsageResponse'],
      ['class', 'MyUsageResponseState'],
      ['enum', 'MyUsageResponseStatePlan'],
    ]);
    expect(declarations[2][2]).toEqual([
      '    @SerialName("free") FREE,',
      '    @SerialName("pro") PRO,',
    ]);
  });

  it('renames a key Kotlin cannot spell and records the wire name', () => {
    const { declarations, usesSerialName } = emitKotlin(
      object({ 'content-type': { type: 'string' } }),
      'Sample'
    );

    expect(usesSerialName).toBe(true);
    expect(declarations[0][2]).toEqual([
      '    @SerialName("content-type") val contentType: String,',
    ]);
  });

  it('refuses a shape it cannot express rather than widening the app', () => {
    expect(() => emitKotlin({ type: 'object', additionalProperties: true }, 'Sample')).toThrow(
      /not representable/
    );
  });
});

describe('renderKotlinFile', () => {
  it('writes a package, the imports it uses and the declarations', () => {
    const rendered = renderKotlinFile([['class', 'Sample', ['    val id: String,']]], {
      usesSerialName: false,
      sourceModule: 'shared/contracts/plans',
    });

    expect(rendered).toContain('package com.royaraqamia.app.contracts.generated');
    expect(rendered).toContain('import kotlinx.serialization.Serializable');
    expect(rendered).not.toContain('import kotlinx.serialization.SerialName');
    expect(rendered).toContain('data class Sample(');
  });
});
