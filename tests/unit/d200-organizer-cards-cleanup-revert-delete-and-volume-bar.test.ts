import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('D-200: Organizer Concert Cards Cleanup, Revert to Draft, Delete System & Minimalist Volume Bar Order Limit', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const eventsManagerPath = path.join(rootDir, 'src/components/organizer-events-manager.tsx');
  const globalsCssPath = path.join(rootDir, 'src/app/globals.css');
  const requirementPath = path.join(rootDir, 'docs/requirement.md');
  const serverEventsPath = path.join(rootDir, 'src/server/events.ts');
  const eventRoutePath = path.join(rootDir, 'src/app/api/events/[id]/route.ts');

  const eventsManagerContent = fs.readFileSync(eventsManagerPath, 'utf8');
  const globalsCssContent = (`${fs.readFileSync(globalsCssPath, 'utf8')}\n${fs.readFileSync(globalsCssPath.replace("src/app/globals.css", "src/app/back-office/back-office.css"), 'utf8')}`);
  const requirementContent = fs.readFileSync(requirementPath, 'utf8');
  const serverEventsContent = fs.readFileSync(serverEventsPath, 'utf8');
  const eventRouteContent = fs.readFileSync(eventRoutePath, 'utf8');

  it('1. Item 1: Removes "ดูตัวอย่าง" button completely from draft and pending_approval cards', () => {
    expect(eventsManagerContent).not.toMatch(/data-testid=\{`preview-draft-btn-\$\{ev\.id\}`\}/);
    expect(eventsManagerContent).not.toMatch(/data-testid=\{`preview-pending-btn-\$\{ev\.id\}`\}/);
    // Draft cards should only have edit, submit, and delete
    expect(eventsManagerContent).toMatch(/data-testid=\{`edit-draft-btn-\$\{ev\.id\}`\}/);
    expect(eventsManagerContent).toMatch(/data-testid=\{`submit-draft-btn-\$\{ev\.id\}`\}/);
    expect(eventsManagerContent).toMatch(/data-testid=\{`delete-event-btn-\$\{ev\.id\}`\}/);
  });

  it('2. Item 2: Pending approval cards have "ดึงกลับเป็นฉบับร่าง" button', () => {
    expect(eventsManagerContent).toMatch(/data-testid=\{`revert-draft-btn-\$\{ev\.id\}`\}/);
    expect(eventsManagerContent).toContain('ดึงกลับเป็นฉบับร่าง');
    expect(eventsManagerContent).toContain('handleRevertToDraft');
    expect(eventsManagerContent).toMatch(/\/api\/events\/\$\{eventId\}\?action=revert-to-draft/);
  });

  it('3. Item 2: Server revertEventToDraft updates event and sessions to draft', () => {
    expect(serverEventsContent).toContain('export async function revertEventToDraft');
    expect(serverEventsContent).toContain("UPDATE events SET status = 'draft'");
    expect(serverEventsContent).toContain("UPDATE event_sessions SET status = 'draft'");
    expect(eventRouteContent).toContain("action === 'revert-to-draft'");
    expect(eventRouteContent).toContain('revertEventToDraft(pool, id, session.user.id)');
  });

  it('4. Item 3: Delete button on draft and pending approval cards with modal confirmation', () => {
    expect(eventsManagerContent).toMatch(/data-testid=\{`delete-event-btn-\$\{ev\.id\}`\}/);
    expect(eventsManagerContent).toContain('setDeletingEvent(ev)');
    expect(eventsManagerContent).toContain('delete-confirm-dialog');
    expect(eventsManagerContent).toContain('data-testid="confirm-delete-event-btn"');
    expect(eventsManagerContent).toContain('ยืนยันการลบงานคอนเสิร์ต');
    expect(eventsManagerContent).toContain('handleConfirmDeleteEvent');
  });

  it('5. Item 3: Server deleteEventDraft and API DELETE safely delete unapproved concerts without orders', () => {
    expect(serverEventsContent).toContain('export async function deleteEventDraft');
    expect(serverEventsContent).toContain("SELECT id FROM orders WHERE \"eventId\" = $1");
    expect(serverEventsContent).toContain("DELETE FROM events WHERE id = $1");
    expect(eventRouteContent).toContain('export async function DELETE');
    expect(eventRouteContent).toContain('deleteEventDraft(pool, id, session.user.id)');
  });

  it('6. Item 4: Custom limit uses Minimalist 10-Segment Volume Bar spanning full card width', () => {
    expect(eventsManagerContent).toContain('volume-bar-stepper');
    expect(eventsManagerContent).toContain('volume-bar-row');
    expect(eventsManagerContent).toContain('volume-bar-btn');
    expect(eventsManagerContent).toContain('volume-bar-track');
    expect(eventsManagerContent).toContain('volume-bar-segment');
    expect(eventsManagerContent).toContain('data-testid="volume-bar-decrement-btn"');
    expect(eventsManagerContent).toContain('data-testid="volume-bar-increment-btn"');
    expect(eventsManagerContent).toMatch(/data-testid=\{`volume-bar-segment-\$\{n\}`\}/);
  });

  it('7. Item 4: CSS rules provide clean monochrome line styling for Volume Bar and Delete Modal', () => {
    expect(globalsCssContent).toContain('.volume-bar-stepper');
    expect(globalsCssContent).toContain('.volume-bar-row');
    expect(globalsCssContent).toContain('.volume-bar-track');
    expect(globalsCssContent).toContain('.volume-bar-segment');
    expect(globalsCssContent).toContain('.volume-bar-segment.filled');
    expect(globalsCssContent).toContain('.delete-confirm-dialog');
    expect(globalsCssContent).toContain('.delete-confirm-header');
    expect(globalsCssContent).toContain('.delete-confirm-actions');
  });

  it('8. D-200 decisions recorded in requirement.md', () => {
    expect(requirementContent).toContain('D-200');
    expect(requirementContent).toContain('Organizer Concert Cards Cleanup, Revert to Draft, Delete System & Minimalist Volume Bar Order Limit');
  });

  it('9. Zero Emojis (D-14) compliance across all touched files', () => {
    const emojiRegex = /\p{Extended_Pictographic}/u;
    expect(emojiRegex.test(eventsManagerContent)).toBe(false);
    expect(emojiRegex.test(globalsCssContent)).toBe(false);
    expect(emojiRegex.test(serverEventsContent)).toBe(false);
    expect(emojiRegex.test(eventRouteContent)).toBe(false);
    expect(emojiRegex.test(requirementContent)).toBe(false);
  });
});
