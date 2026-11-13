import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('D-229 to D-232: Removal of Header Shortcuts, All-Status Mock Concerts, Horizontal Row Cards & Dedicated Refunds Tab', () => {
  const rootDir = process.cwd();

  it('verifies D-229: Removal of top shortcut cards in Approval section & direct Hub entry', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );
    // Approval section renders directly without shortcut cards or redundant subtab header
    expect(workspaceContent).toContain('/* D-229: Remove top shortcut card for approval section */');
    expect(workspaceContent).toContain("activeSection !== 'approval' && (");
    expect(workspaceContent).toContain("activeSection === 'approval' && (");
    expect(workspaceContent).toContain('<OwnerSessionApprovalManager />');
    // Ensure no approval subtabs are rendered above OwnerSessionApprovalManager
    expect(workspaceContent).not.toMatch(/approvalSubTab.*subtab-btn/);
  });

  it('does not substitute demo concerts or requests when real results are empty', () => {
    const managerContent = readFileSync(join(rootDir, 'src/components/owner-session-approval-manager.tsx'), 'utf8');
    expect(managerContent).not.toContain('SAMPLE_MOCK_PENDING_SESSIONS');
    expect(managerContent).not.toContain('SAMPLE_MOCK_AMENDMENTS');
    expect(managerContent).not.toContain('SAMPLE_MOCK_CANCELLATIONS');
    expect(managerContent).not.toContain('SAMPLE_MOCK_ALL_EVENTS');
  });

  it('verifies D-231: Full-width horizontal row card design & hairline dividers', () => {
    const managerContent = readFileSync(
      join(rootDir, 'src/components/owner-session-approval-manager.tsx'),
      'utf8',
    );
    const cssContent = (`${readFileSync(
      join(rootDir, 'src/app/globals.css'),
      'utf8',
    )}\n${readFileSync(join(rootDir, 'src/app/globals.css').replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);

    // Manager uses horizontal row card classes and hairline dividers (evolved in D-242 to image-free cards)
    expect(managerContent).toContain('concert-horizontal-row-card');
    expect(managerContent).toContain('hub-section-divider');
    expect(managerContent).toContain('row-card-center');
    expect(managerContent).toContain('row-card-right');
    expect(managerContent).not.toContain('row-poster-placeholder');
    expect(managerContent).toContain('row-event-title');
    expect(managerContent).toContain('row-meta-strip');
    expect(managerContent).toContain('row-tags-strip');

    // CSS contains styling for horizontal row cards and hairline divider
    expect(cssContent).toContain('.concert-horizontal-row-card {');
    expect(cssContent).toContain('.hub-section-divider {');
    expect(cssContent).toContain('.concert-horizontal-list {');
    expect(cssContent).toContain('.row-card-left {');
    expect(cssContent).toContain('.row-card-center {');
    expect(cssContent).toContain('.row-card-right {');
    expect(cssContent).toContain('.concert-management-pipeline {');
  });

  it('verifies D-232: Dedicated Refunds subnav tab separated from Concert Approval Hub', () => {
    const workspaceContent = readFileSync(
      join(rootDir, 'src/components/owner-workspace-view.tsx'),
      'utf8',
    );

    // Refunds tab is part of SECTIONS and HASH_TO_SECTION
    expect(workspaceContent).toContain("id: 'refunds'");
    expect(workspaceContent).toContain("label: 'คำขอคืนเงินและการโอนคืน'");
    expect(workspaceContent).toContain("refunds: 'refunds'");
    expect(workspaceContent).toContain("'owner-refund-approval-manager': 'refunds'");

    // Dedicated refunds section rendered
    expect(workspaceContent).toContain("activeSection === 'refunds' && (");
    expect(workspaceContent).toContain('<OwnerRefundApprovalManager />');
    // D-240 unstyled structural text nav: no coming-soon pill
    expect(workspaceContent).not.toContain('subnav-coming-soon-pill');
  });

  it('verifies D-14: Zero Emojis compliance across all modified files', () => {
    const filesToCheck = [
      'src/components/owner-session-approval-manager.tsx',
      'src/components/owner-workspace-view.tsx',
      'src/app/globals.css',
      'docs/requirement.md',
    ];

    for (const file of filesToCheck) {
      const content = readFileSync(join(rootDir, file), 'utf8');
      expect(content).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
