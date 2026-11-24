'use client';

import { useState, useEffect, useRef, useId, useCallback } from 'react';
import {
  DEFAULT_EMAIL_MASTER_TEMPLATE,
  DEFAULT_EMAIL_SECTION_ORDER,
  INITIAL_EMAIL_PRESETS,
  EMAIL_SCENARIO_CATEGORIES,
  EMAIL_SCENARIOS,
  type EmailScenarioCategory,
  type EmailScenarioKey,
  type EmailSectionKey,
  type EmailTemplateState,
  type EmailTemplatePreset,
  getDefaultScenarioPresets,
  getScenariosByCategory,
  interpolateEmailVariables,
  normalizeEmailSectionOrder,
} from '@/lib/email-template';
import { generateTicketDataUrl } from './ticket-canvas-download';
import type { TicketDetail } from '@/server/tickets';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MailIcon,
  PlusIcon,
  QrCodeIcon,
  RefreshIcon,
  ShieldCheckIcon,
  SlidersIcon,
  XIcon,
} from './icons';
import { triggerToast, triggerRefreshToast } from './toast-notification';

const PREVIEW_SAMPLE_DATA = {
  concert_name: 'TICKET FESTIVAL 2026: LIVE IN BANGKOK',
  buyer_name: 'คุณพงศธร รักดนตรี',
  buyer_email: 'pongsathorn@example.com',
  order_id: 'ORD-20261123-9081',
  total_tickets: 2,
  session_date: '15 ธ.ค. 2026',
  session_time: '19:00',
  location: 'อิมแพ็ค อารีน่า เมืองทองธานี',
  ticket_code: 'TK-202611-0088-01',
  ticket_type: 'VIP Zone A (Seat A-08)',
  ticket_price: '3,500 บาท',
  poster_url: 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?auto=format&fit=crop&w=1200&q=80',
};

const SAMPLE_TICKET_DETAIL: TicketDetail = {
  id: 'tkt-sample-preview-01',
  orderId: PREVIEW_SAMPLE_DATA.order_id,
  orderItemId: 'item-01',
  ticketCode: PREVIEW_SAMPLE_DATA.ticket_code,
  status: 'valid',
  admissionStatus: 'outside',
  qrPayload: PREVIEW_SAMPLE_DATA.ticket_code,
  qrCodeUrl: '',
  buyerName: PREVIEW_SAMPLE_DATA.buyer_name,
  buyerEmail: PREVIEW_SAMPLE_DATA.buyer_email,
  buyerPhone: '081-234-5678',
  eventId: 'event-01',
  sessionId: 's1',
  ticketTypeId: 'tt1',
  ticketTypeName: PREVIEW_SAMPLE_DATA.ticket_type,
  ticketPrice: 3500,
  eventTitle: PREVIEW_SAMPLE_DATA.concert_name,
  location: PREVIEW_SAMPLE_DATA.location,
  sessionStartTime: '2026-12-15T19:00:00+07:00',
  sessionEndTime: '2026-12-15T22:30:00+07:00',
  createdAt: '2026-11-23T10:00:00+07:00',
};

const SAMPLE_TICKET_DETAIL_2: TicketDetail = {
  ...SAMPLE_TICKET_DETAIL,
  id: 'tkt-sample-preview-02',
  ticketCode: 'TK-202611-0088-02',
  ticketTypeName: 'VIP Zone A (Seat A-09)',
};

const SAMPLE_BATCH_25_TICKETS = Array.from({ length: 25 }, (_, i) => ({
  index: i + 1,
  ticketType: i < 5 ? 'VIP Zone A' : i < 15 ? 'Regular Zone B' : 'Standing Zone C',
  ticketCode: `TK-202611-0088-${String(i + 1).padStart(2, '0')}`,
}));

const SECTION_META: Record<EmailSectionKey, { title: string; shortLabel: string; subtitle: string }> = {
  poster: {
    title: 'ภาพโปสเตอร์คอนเสิร์ตแนวนอน (Landscape Poster)',
    shortLabel: 'โปสเตอร์แนวยาว',
    subtitle: 'ภาพเต็มขอบแนวนอนความสูง 220px ล้วน ไม่มีข้อความซ้อนทับ',
  },
  body: {
    title: 'คำทักทาย เนื้อหา & รายละเอียดคอนเสิร์ต',
    shortLabel: 'เนื้อหาข้อความ',
    subtitle: 'ข้อความทักทาย เนื้อความหลัก และกรอบสรุปสถานที่/รอบแสดง',
  },
  pass: {
    title: 'รูปบัตรคอนเสิร์ตจริงของลูกค้า (Ticket Pass Image)',
    shortLabel: 'รูปบัตรคอนเสิร์ตจริง',
    subtitle: 'ภาพบัตรคอนเสิร์ตจริงความละเอียดสูงจากระบบออกบัตร',
  },
};

function formatSectionOrderLabel(order?: EmailSectionKey[]): string {
  const normalized = normalizeEmailSectionOrder(order);
  return normalized.map((key) => SECTION_META[key].shortLabel).join(' -> ');
}

export function AdminEmailDesigner() {
  const [template, setTemplate] = useState<EmailTemplateState>(DEFAULT_EMAIL_MASTER_TEMPLATE);
  const [draftTemplate, setDraftTemplate] = useState<EmailTemplateState>(DEFAULT_EMAIL_MASTER_TEMPLATE);
  const [presets, setPresets] = useState<EmailTemplatePreset[]>(INITIAL_EMAIL_PRESETS);
  const [activePresetId, setActivePresetId] = useState<string>(INITIAL_EMAIL_PRESETS[0].id);

  // Scenario Selector & Presets States
  const [activeCategory, setActiveCategory] = useState<EmailScenarioCategory>('customer');
  const [activeScenario, setActiveScenario] = useState<EmailScenarioKey>('ticket_delivery');
  const [scenarioTemplates, setScenarioTemplates] = useState<Partial<Record<EmailScenarioKey, EmailTemplateState>>>({});
  const [scenarioPresets, setScenarioPresets] = useState<Partial<Record<EmailScenarioKey, EmailTemplatePreset[]>>>({});
  const [scenarioActivePresetIds, setScenarioActivePresetIds] = useState<Partial<Record<EmailScenarioKey, string>>>({});

  const scenarioSelectId = useId();
  const presetSelectId = useId();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Grounded Tabs State: 'settings' or 'preview'
  const [activeCanvasView, setActiveCanvasView] = useState<'settings' | 'preview'>('settings');

  // Modal States
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [activeModalCategory, setActiveModalCategory] = useState<1 | 2 | 3 | 4>(1);
  const [modalPreviewDevice, setModalPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  const [addTemplateModalOpen, setAddTemplateModalOpen] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');

  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Main Preview tab device switcher
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Real Buyer Ticket Pass PNG data URLs & Ticket Count Simulation
  const [realTicketPassDataUrl, setRealTicketPassDataUrl] = useState<string>('');
  const [realTicketPassDataUrl2, setRealTicketPassDataUrl2] = useState<string>('');
  const [previewTicketCount, setPreviewTicketCount] = useState<1 | 2 | 25>(1);

  // Active input ref for merge tags in Category 3
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);
  const greetingInputRef = useRef<HTMLInputElement>(null);
  const [activeInput, setActiveInput] = useState<'subject' | 'body' | 'greeting'>('body');

  const currentScenarioDef = EMAIL_SCENARIOS[activeScenario] || EMAIL_SCENARIOS.ticket_delivery;
  const currentCategoryDef = EMAIL_SCENARIO_CATEGORIES.find((c) => c.id === activeCategory);
  const categoryScenarios = getScenariosByCategory(activeCategory);

  const currentScenarioPresets: EmailTemplatePreset[] =
    scenarioPresets[activeScenario] ||
    (activeScenario === 'ticket_delivery' ? presets : getDefaultScenarioPresets(activeScenario));

  const currentActivePresetId: string =
    scenarioActivePresetIds[activeScenario] ||
    (activeScenario === 'ticket_delivery' ? activePresetId : currentScenarioPresets[0]?.id || '');

  // Close open modals cleanly on Escape key
  useEffect(() => {
    if (!editModalOpen && !addTemplateModalOpen && !renameModalOpen && !testModalOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditModalOpen(false);
        setAddTemplateModalOpen(false);
        setRenameModalOpen(false);
        setTestModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editModalOpen, addTemplateModalOpen, renameModalOpen, testModalOpen]);

  // Generate real ticket pass PNG images on client mount
  useEffect(() => {
    let isMounted = true;
    Promise.all([
      generateTicketDataUrl(SAMPLE_TICKET_DETAIL),
      generateTicketDataUrl(SAMPLE_TICKET_DETAIL_2),
    ])
      .then(([url1, url2]) => {
        if (isMounted) {
          setRealTicketPassDataUrl(url1);
          setRealTicketPassDataUrl2(url2);
        }
      })
      .catch((err) => {
        console.warn('Canvas ticket pass generation fallback', err);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch('/api/owner/email-template');
      if (res.ok) {
        const data = await res.json();
        let loadedScenarioTemplates: Partial<Record<EmailScenarioKey, EmailTemplateState>> = {};
        if (data?.scenarioTemplates && typeof data.scenarioTemplates === 'object') {
          loadedScenarioTemplates = data.scenarioTemplates;
          setScenarioTemplates(loadedScenarioTemplates);
        }
        let loadedScenarioPresets: Partial<Record<EmailScenarioKey, EmailTemplatePreset[]>> = {};
        if (data?.scenarioPresets && typeof data.scenarioPresets === 'object') {
          loadedScenarioPresets = data.scenarioPresets;
          setScenarioPresets(loadedScenarioPresets);
        }
        let loadedScenarioActivePresetIds: Partial<Record<EmailScenarioKey, string>> = {};
        if (data?.scenarioActivePresetIds && typeof data.scenarioActivePresetIds === 'object') {
          loadedScenarioActivePresetIds = data.scenarioActivePresetIds;
          setScenarioActivePresetIds(loadedScenarioActivePresetIds);
        }
        if (Array.isArray(data?.presets) && data.presets.length > 0) {
          setPresets(data.presets);
        }
        if (typeof data?.activePresetId === 'string') {
          setActivePresetId(data.activePresetId);
        }

        const scKey =
          data?.activeScenario && data.activeScenario in EMAIL_SCENARIOS
            ? (data.activeScenario as EmailScenarioKey)
            : 'ticket_delivery';
        setActiveScenario(scKey);
        const def = EMAIL_SCENARIOS[scKey];
        if (def) {
          setActiveCategory(def.category);
        }

        const scPresets: EmailTemplatePreset[] =
          loadedScenarioPresets[scKey] ||
          (scKey === 'ticket_delivery' ? (Array.isArray(data?.presets) ? data.presets : INITIAL_EMAIL_PRESETS) : getDefaultScenarioPresets(scKey));
        const scActiveId =
          loadedScenarioActivePresetIds[scKey] ||
          (scKey === 'ticket_delivery' ? (typeof data?.activePresetId === 'string' ? data.activePresetId : scPresets[0]?.id) : scPresets[0]?.id);
        const activePreset = scPresets.find((p: EmailTemplatePreset) => p.id === scActiveId) || scPresets[0];

        const targetScenarioTemplate = loadedScenarioTemplates[scKey];
        const targetState =
          targetScenarioTemplate || activePreset?.template || def?.defaultTemplate || data?.template || DEFAULT_EMAIL_MASTER_TEMPLATE;

        setTemplate(targetState);
        setDraftTemplate(targetState);
      }
    } catch (err) {
      console.error('Failed to load email master template:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleManualRefresh = async () => {
    setIsLoading(true);
    await loadData();
    triggerRefreshToast('รีเฟรชข้อมูลเทมเพลตอีเมลเรียบร้อยแล้ว');
  };

  const handleSelectScenario = (newScenario: EmailScenarioKey) => {
    setActiveScenario(newScenario);
    const def = EMAIL_SCENARIOS[newScenario] || EMAIL_SCENARIOS.ticket_delivery;
    setActiveCategory(def.category);

    const scPresets =
      scenarioPresets[newScenario] ||
      (newScenario === 'ticket_delivery' ? presets : getDefaultScenarioPresets(newScenario));
    const scActiveId =
      scenarioActivePresetIds[newScenario] ||
      (newScenario === 'ticket_delivery' ? activePresetId : scPresets[0]?.id);
    const activePreset = scPresets.find((p) => p.id === scActiveId) || scPresets[0];

    const targetState = scenarioTemplates[newScenario] || activePreset?.template || def.defaultTemplate;
    setTemplate(targetState);
    setDraftTemplate(targetState);
  };

  const handleSelectCategory = (newCategory: EmailScenarioCategory) => {
    setActiveCategory(newCategory);
    const def = EMAIL_SCENARIOS[activeScenario];
    if (!def || def.category !== newCategory) {
      const firstInCat = getScenariosByCategory(newCategory)[0];
      if (firstInCat) {
        handleSelectScenario(firstInCat.id);
      }
    }
  };

  const handleSelectPreset = async (presetId: string) => {
    const selected = currentScenarioPresets.find((p) => p.id === presetId);
    if (!selected) return;

    const nextActiveIds = {
      ...scenarioActivePresetIds,
      [activeScenario]: presetId,
    };
    const nextScenarioTemplates = {
      ...scenarioTemplates,
      [activeScenario]: selected.template,
    };

    setTemplate(selected.template);
    setDraftTemplate(selected.template);

    if (activeScenario === 'ticket_delivery') {
      setActivePresetId(presetId);
    }
    setScenarioActivePresetIds(nextActiveIds);
    setScenarioTemplates(nextScenarioTemplates);

    try {
      await persistPayload(
        selected.template,
        currentScenarioPresets,
        presetId,
        nextScenarioTemplates,
        activeScenario,
        scenarioPresets,
        nextActiveIds,
      );
      triggerToast({
        type: 'info',
        message: `เปลี่ยนไปใช้เทมเพลต: "${selected.name}"`,
      });
    } catch (err) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสลับเทมเพลต',
      });
    }
  };

  const persistPayload = async (
    targetTemplate: EmailTemplateState,
    targetPresets: EmailTemplatePreset[],
    targetActiveId: string,
    targetScenarioTemplates?: Partial<Record<EmailScenarioKey, EmailTemplateState>>,
    targetActiveScenario?: EmailScenarioKey,
    targetScenarioPresets?: Partial<Record<EmailScenarioKey, EmailTemplatePreset[]>>,
    targetScenarioActivePresetIds?: Partial<Record<EmailScenarioKey, string>>,
  ) => {
    setIsSaving(true);
    try {
      const activeSc = targetActiveScenario ?? activeScenario;
      const mergedScenarioPresets = {
        ...(targetScenarioPresets ?? scenarioPresets),
        [activeSc]: targetPresets,
      };
      const mergedScenarioActiveIds = {
        ...(targetScenarioActivePresetIds ?? scenarioActivePresetIds),
        [activeSc]: targetActiveId,
      };

      // Ticket delivery backward compatibility:
      const ticketDeliveryPresets =
        activeSc === 'ticket_delivery' ? targetPresets : (mergedScenarioPresets.ticket_delivery || presets);
      const ticketDeliveryActiveId =
        activeSc === 'ticket_delivery' ? targetActiveId : (mergedScenarioActiveIds.ticket_delivery || activePresetId);
      const ticketDeliveryTemplate =
        activeSc === 'ticket_delivery' ? targetTemplate : (scenarioTemplates.ticket_delivery || template);

      const res = await fetch('/api/owner/email-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: ticketDeliveryTemplate,
          presets: ticketDeliveryPresets,
          activePresetId: ticketDeliveryActiveId,
          scenarioTemplates: targetScenarioTemplates ?? scenarioTemplates,
          scenarioPresets: mergedScenarioPresets,
          scenarioActivePresetIds: mergedScenarioActiveIds,
          activeScenario: activeSc,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'บันทึกเทมเพลตอีเมลไม่สำเร็จ');
      }
      return data;
    } finally {
      setIsSaving(false);
    }
  };

  // Create new template preset for active scenario
  const handleCreateNewTemplate = async () => {
    const trimmed = newTemplateName.trim();
    if (!trimmed) {
      triggerToast({ type: 'info', message: 'กรุณาระบุชื่อเทมเพลตใหม่' });
      return;
    }

    const newId = `user-template-${activeScenario}-${Date.now()}`;
    const newPreset: EmailTemplatePreset = {
      id: newId,
      name: trimmed,
      description: `เทมเพลตสร้างโดยผู้ใช้สำหรับ ${currentScenarioDef.name}`,
      template: { ...template },
      updatedAt: new Date().toISOString(),
    };

    const nextPresets = [...currentScenarioPresets, newPreset];
    const nextScenarioPresets = {
      ...scenarioPresets,
      [activeScenario]: nextPresets,
    };
    const nextScenarioActiveIds = {
      ...scenarioActivePresetIds,
      [activeScenario]: newId,
    };
    const nextScenarioTemplates = {
      ...scenarioTemplates,
      [activeScenario]: newPreset.template,
    };

    try {
      await persistPayload(
        newPreset.template,
        nextPresets,
        newId,
        nextScenarioTemplates,
        activeScenario,
        nextScenarioPresets,
        nextScenarioActiveIds,
      );
      if (activeScenario === 'ticket_delivery') {
        setPresets(nextPresets);
        setActivePresetId(newId);
      }
      setScenarioPresets(nextScenarioPresets);
      setScenarioActivePresetIds(nextScenarioActiveIds);
      setScenarioTemplates(nextScenarioTemplates);
      setTemplate(newPreset.template);
      setDraftTemplate(newPreset.template);
      setAddTemplateModalOpen(false);
      setNewTemplateName('');
      triggerToast({ type: 'success', message: `สร้างเทมเพลตใหม่ "${trimmed}" เรียบร้อยแล้ว` });
    } catch (err) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการสร้างเทมเพลต',
      });
    }
  };

  // Rename current template preset for active scenario
  const handleRenameCurrentTemplate = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      triggerToast({ type: 'info', message: 'กรุณาระบุชื่อเทมเพลต' });
      return;
    }

    const nextPresets = currentScenarioPresets.map((p) =>
      p.id === currentActivePresetId ? { ...p, name: trimmed, updatedAt: new Date().toISOString() } : p,
    );
    const nextScenarioPresets = {
      ...scenarioPresets,
      [activeScenario]: nextPresets,
    };

    try {
      await persistPayload(
        template,
        nextPresets,
        currentActivePresetId,
        scenarioTemplates,
        activeScenario,
        nextScenarioPresets,
        scenarioActivePresetIds,
      );
      if (activeScenario === 'ticket_delivery') {
        setPresets(nextPresets);
      }
      setScenarioPresets(nextScenarioPresets);
      setRenameModalOpen(false);
      triggerToast({ type: 'success', message: `เปลี่ยนชื่อเทมเพลตเป็น "${trimmed}" เรียบร้อยแล้ว` });
    } catch (err) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการเปลี่ยนชื่อเทมเพลต',
      });
    }
  };

  // Delete current template preset for active scenario
  const handleDeleteActiveTemplate = async () => {
    if (currentScenarioPresets.length <= 1) {
      triggerToast({ type: 'info', message: 'ต้องมีเทมเพลตในแต่ละกรณีอย่างน้อย 1 แบบ' });
      return;
    }

    const current = currentScenarioPresets.find((p) => p.id === currentActivePresetId);
    if (!confirm(`คุณต้องการลบเทมเพลต "${current?.name || currentActivePresetId}" ใช่หรือไม่?`)) {
      return;
    }

    const nextPresets = currentScenarioPresets.filter((p) => p.id !== currentActivePresetId);
    const nextActive = nextPresets[0];

    const nextScenarioPresets = {
      ...scenarioPresets,
      [activeScenario]: nextPresets,
    };
    const nextScenarioActiveIds = {
      ...scenarioActivePresetIds,
      [activeScenario]: nextActive.id,
    };
    const nextScenarioTemplates = {
      ...scenarioTemplates,
      [activeScenario]: nextActive.template,
    };

    try {
      await persistPayload(
        nextActive.template,
        nextPresets,
        nextActive.id,
        nextScenarioTemplates,
        activeScenario,
        nextScenarioPresets,
        nextScenarioActiveIds,
      );
      if (activeScenario === 'ticket_delivery') {
        setPresets(nextPresets);
        setActivePresetId(nextActive.id);
      }
      setScenarioPresets(nextScenarioPresets);
      setScenarioActivePresetIds(nextScenarioActiveIds);
      setScenarioTemplates(nextScenarioTemplates);
      setTemplate(nextActive.template);
      setDraftTemplate(nextActive.template);
      triggerToast({ type: 'info', message: `ลบเทมเพลตเรียบร้อยแล้ว เปลี่ยนไปใช้ "${nextActive.name}"` });
    } catch (err) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการลบเทมเพลต',
      });
    }
  };

  // Reorder section up/down in Edit Modal
  const handleMoveSection = (index: number, direction: -1 | 1) => {
    const currentOrder = normalizeEmailSectionOrder(draftTemplate.sectionOrder);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= currentOrder.length) return;
    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(index, 1);
    nextOrder.splice(targetIndex, 0, moved);
    setDraftTemplate((prev) => ({ ...prev, sectionOrder: nextOrder }));
  };

  // Save changes from Edit Modal (Supports active scenario)
  const handleSaveDraftChanges = async () => {
    const cleanDraft: EmailTemplateState = {
      ...draftTemplate,
      sectionOrder: normalizeEmailSectionOrder(draftTemplate.sectionOrder),
    };

    const updatedPresets = currentScenarioPresets.map((p) =>
      p.id === currentActivePresetId ? { ...p, template: cleanDraft, updatedAt: new Date().toISOString() } : p,
    );
    const updatedScenarioTemplates = {
      ...scenarioTemplates,
      [activeScenario]: cleanDraft,
    };
    const updatedScenarioPresets = {
      ...scenarioPresets,
      [activeScenario]: updatedPresets,
    };

    try {
      await persistPayload(
        cleanDraft,
        updatedPresets,
        currentActivePresetId,
        updatedScenarioTemplates,
        activeScenario,
        updatedScenarioPresets,
        scenarioActivePresetIds,
      );
      if (activeScenario === 'ticket_delivery') {
        setPresets(updatedPresets);
      }
      setScenarioPresets(updatedScenarioPresets);
      setScenarioTemplates(updatedScenarioTemplates);
      setTemplate(cleanDraft);
      setDraftTemplate(cleanDraft);
      setEditModalOpen(false);
      triggerToast({
        type: 'success',
        message: `บันทึกการแก้ไขเทมเพลต "${currentScenarioDef.name}" เรียบร้อยแล้ว`,
      });
    } catch (err) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการบันทึกเทมเพลต',
      });
    }
  };

  const handleOpenEditModal = () => {
    setDraftTemplate({
      ...template,
      sectionOrder: normalizeEmailSectionOrder(template.sectionOrder),
    });
    setActiveModalCategory(1);
    setModalPreviewDevice(previewDevice);
    setEditModalOpen(true);
  };

  const handleResetDraft = () => {
    if (confirm(`คุณต้องการคืนค่าเทมเพลต "${currentScenarioDef.name}" เป็นค่าเริ่มต้นใช่หรือไม่?`)) {
      const defState = currentScenarioDef.defaultTemplate;
      setDraftTemplate({
        ...defState,
        sectionOrder: [...(defState.sectionOrder || DEFAULT_EMAIL_SECTION_ORDER)],
      });
      triggerToast({ type: 'info', message: 'คืนค่าเริ่มต้นในฟอร์มแล้ว (กดบันทึกเพื่อใช้งานจริง)' });
    }
  };

  const handleResetScenarioToDefault = async () => {
    const def = EMAIL_SCENARIOS[activeScenario];
    if (!def) return;
    if (!confirm(`คุณต้องการคืนค่าเทมเพลต "${def.name}" กลับเป็นค่ามาตรฐานของระบบใช่หรือไม่?`)) {
      return;
    }
    const defaultPresets = getDefaultScenarioPresets(activeScenario);
    const defaultT = { ...defaultPresets[0].template };

    const updatedScenarioTemplates = { ...scenarioTemplates };
    delete updatedScenarioTemplates[activeScenario];

    const updatedScenarioPresets = { ...scenarioPresets };
    updatedScenarioPresets[activeScenario] = defaultPresets;

    const updatedScenarioActiveIds = { ...scenarioActivePresetIds };
    updatedScenarioActiveIds[activeScenario] = defaultPresets[0].id;

    try {
      await persistPayload(
        defaultT,
        defaultPresets,
        defaultPresets[0].id,
        updatedScenarioTemplates,
        activeScenario,
        updatedScenarioPresets,
        updatedScenarioActiveIds,
      );
      if (activeScenario === 'ticket_delivery') {
        setPresets(defaultPresets);
        setActivePresetId(defaultPresets[0].id);
      }
      setScenarioTemplates(updatedScenarioTemplates);
      setScenarioPresets(updatedScenarioPresets);
      setScenarioActivePresetIds(updatedScenarioActiveIds);
      setTemplate(defaultT);
      setDraftTemplate(defaultT);
      triggerToast({ type: 'info', message: `คืนค่าเริ่มต้นเทมเพลต "${def.name}" เรียบร้อยแล้ว` });
    } catch (err) {
      triggerToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการคืนค่าเริ่มต้น',
      });
    }
  };

  const handleInsertTag = (tag: string) => {
    if (activeInput === 'subject') {
      const el = subjectInputRef.current;
      if (!el) {
        setDraftTemplate((prev) => ({ ...prev, subject: `${prev.subject} ${tag}` }));
        return;
      }
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = draftTemplate.subject;
      const nextVal = val.slice(0, start) + tag + val.slice(end);
      setDraftTemplate((prev) => ({ ...prev, subject: nextVal }));
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 50);
    } else if (activeInput === 'greeting') {
      const el = greetingInputRef.current;
      if (!el) {
        setDraftTemplate((prev) => ({ ...prev, greetingText: `${prev.greetingText} ${tag}` }));
        return;
      }
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = draftTemplate.greetingText;
      const nextVal = val.slice(0, start) + tag + val.slice(end);
      setDraftTemplate((prev) => ({ ...prev, greetingText: nextVal }));
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 50);
    } else {
      const el = bodyInputRef.current;
      if (!el) {
        setDraftTemplate((prev) => ({ ...prev, bodyText: `${prev.bodyText} ${tag}` }));
        return;
      }
      const start = el.selectionStart || 0;
      const end = el.selectionEnd || 0;
      const val = draftTemplate.bodyText;
      const nextVal = val.slice(0, start) + tag + val.slice(end);
      setDraftTemplate((prev) => ({ ...prev, bodyText: nextVal }));
      setTimeout(() => {
        el.focus();
        el.setSelectionRange(start + tag.length, start + tag.length);
      }, 50);
    }
  };

  const handleTestButtonClick = (buttonName: string, targetUrl: string) => {
    const resolvedUrl = interpolateEmailVariables(targetUrl, currentScenarioDef.sampleData);
    triggerToast({
      type: 'info',
      message: `ทดสอบกดปุ่ม "${buttonName}": ลิงก์ไปยัง ${resolvedUrl}`,
      duration: 4000,
    });
  };

  const handleSendTestEmail = async () => {
    setIsSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/owner/email-template/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: testEmailRecipient || undefined,
          template,
          scenario: activeScenario,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'ส่งอีเมลทดสอบไม่สำเร็จ');
      }
      setTestResult({
        ok: true,
        message: `ส่งอีเมลทดสอบ (${currentScenarioDef.name}) ไปยัง ${data.recipient} สำเร็จแล้ว (Message ID: ${data.messageId})`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'เกิดข้อผิดพลาดในการส่งอีเมล',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const activePrimaryBtnTarget = template.primaryButtonUrl
    ? interpolateEmailVariables(template.primaryButtonUrl, currentScenarioDef.sampleData)
    : (activeScenario === 'ticket_delivery' ? `/orders/${PREVIEW_SAMPLE_DATA.order_id}/success` : '/');

  if (isLoading) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
        กำลังโหลดการตั้งค่าระบบออกแบบอีเมล...
      </div>
    );
  }

  // Simulated Email Preview Card (supports both saved template & live draftTemplate across all scenarios)
  const renderSimulatedEmailCard = (targetTemplate: EmailTemplateState, isMobileView: boolean) => {
    const sampleData = currentScenarioDef.sampleData;
    const previewGreeting = interpolateEmailVariables(targetTemplate.greetingText, sampleData);
    const previewBody = interpolateEmailVariables(targetTemplate.bodyText, sampleData);
    const previewFooter = interpolateEmailVariables(targetTemplate.footerNotes, sampleData);
    const primaryBtnTarget = targetTemplate.primaryButtonUrl
      ? interpolateEmailVariables(targetTemplate.primaryButtonUrl, sampleData)
      : (activeScenario === 'ticket_delivery' ? `/orders/${PREVIEW_SAMPLE_DATA.order_id}/success` : '/');

    // 1. Poster Block (Edge-to-edge landscape banner, fixed 220px)
    const showPoster = targetTemplate.showConcertPoster !== false && (
      activeScenario === 'ticket_delivery' ||
      activeScenario === 'event_reminder' ||
      activeScenario === 'event_rescheduled' ||
      Boolean(targetTemplate.posterUrl)
    );

    const posterBlock = showPoster ? (
      <div
        key="section-poster"
        style={{
          width: '100%',
          overflow: 'hidden',
          background: '#f8fafc',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: Simulated email HTML poster preview */}
        <img
          src={targetTemplate.posterUrl?.trim() || PREVIEW_SAMPLE_DATA.poster_url}
          alt={String(sampleData.concert_name || 'TICKET')}
          style={{
            width: '100%',
            height: '220px',
            objectFit: 'cover',
            objectPosition: 'center',
            display: 'block',
          }}
        />
      </div>
    ) : null;

    // 2. Greeting & Body Block
    const bodyBlock = (
      <div key="section-body" style={{ padding: '20px 20px 0 20px' }}>
        <p style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a', margin: '0 0 12px 0' }}>
          {previewGreeting}
        </p>
        <p style={{ fontSize: '14px', color: '#334155', lineHeight: '1.65', margin: '0 0 16px 0', whiteSpace: 'pre-wrap' }}>
          {previewBody}
        </p>
        {activeScenario === 'ticket_delivery' && (
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '14px 16px',
              fontSize: '13px',
              color: '#475569',
              lineHeight: '1.6',
            }}
          >
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px', marginBottom: '4px' }}>
              {PREVIEW_SAMPLE_DATA.concert_name}
            </div>
            <div>
              สถานที่: <strong style={{ color: '#0f172a' }}>{PREVIEW_SAMPLE_DATA.location}</strong>
            </div>
            <div>
              รอบแสดง:{' '}
              <strong style={{ color: '#0f172a' }}>
                {PREVIEW_SAMPLE_DATA.session_date} เวลา {PREVIEW_SAMPLE_DATA.session_time} น.
              </strong>
            </div>
          </div>
        )}
      </div>
    );

    // 3. Real Buyer Ticket Pass Image Block (Pure Image for ticket_delivery)
    const passBlock = targetTemplate.showTicketCard ? (
      <div key="section-pass" style={{ padding: '20px 20px 0 20px', textAlign: 'center' }}>
        {previewTicketCount === 1 && (
          realTicketPassDataUrl ? (
            /* biome-ignore lint/performance/noImgElement: Real ticket pass high-resolution canvas preview */
            <img
              src={realTicketPassDataUrl}
              alt="รูปบัตรคอนเสิร์ตจริงของลูกค้า"
              style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', margin: '0 auto' }}
            />
          ) : (
            <div style={{ padding: '2rem', color: '#64748b', fontSize: '13px' }}>
              กำลังเรนเดอร์ภาพบัตรคอนเสิร์ต...
            </div>
          )
        )}

        {previewTicketCount === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {realTicketPassDataUrl ? (
              /* biome-ignore lint/performance/noImgElement: Ticket 1 */
              <img
                src={realTicketPassDataUrl}
                alt="รูปบัตรคอนเสิร์ตใบที่ 1"
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', margin: '0 auto' }}
              />
            ) : null}
            {realTicketPassDataUrl2 ? (
              /* biome-ignore lint/performance/noImgElement: Ticket 2 */
              <img
                src={realTicketPassDataUrl2}
                alt="รูปบัตรคอนเสิร์ตใบที่ 2"
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', margin: '0 auto' }}
              />
            ) : null}
          </div>
        )}

        {previewTicketCount === 25 && (
          <div>
            {/* Quota Alert Box - Pure Table Replacement Mode */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '16px',
                margin: '0 0 16px 0',
                textAlign: 'left',
                fontSize: '13px',
                color: '#475569',
                lineHeight: '1.6',
              }}
            >
              <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>
                คำสั่งซื้อนี้มีบัตรทั้งหมด 25 ใบ (เกินโควตาการแสดงผลรูปบัตรในอีเมล 20 ใบ)
              </div>
              <div>
                เพื่อความรวดเร็วและป้องกันอีเมลเกินขนาด ระบบได้สรุปรหัสบัตรทุกใบในตารางด้านล่างนี้ โดยท่านสามารถเปิดดูและดาวน์โหลดรูปบัตรความละเอียดสูงทั้งหมดได้ผ่านเว็บไซต์
              </div>
            </div>

            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#ffffff',
                textAlign: 'left',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '8px 10px', fontWeight: 500 }}>ลำดับ</th>
                    <th style={{ padding: '8px 10px', fontWeight: 500 }}>ประเภทบัตร</th>
                    <th style={{ padding: '8px 10px', fontWeight: 500 }}>รหัสบัตร</th>
                  </tr>
                </thead>
                <tbody>
                  {SAMPLE_BATCH_25_TICKETS.map((t) => (
                    <tr key={t.index} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '6px 10px', color: '#64748b' }}>{t.index}</td>
                      <td style={{ padding: '6px 10px', color: '#0f172a', fontWeight: 500 }}>{t.ticketType}</td>
                      <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#0f172a' }}>{t.ticketCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    ) : null;

    // 4. Scenario-Specific Specialized Preview Blocks
    let scenarioSpecificBlock: React.ReactNode = null;

    if (activeScenario === 'checkout_otp' || activeScenario === 'lookup_otp') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '24px 20px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, marginBottom: '8px' }}>
              รหัสยืนยัน OTP (Single-use ใช้งานได้ 1 ครั้ง)
            </div>
            <div style={{ fontSize: '32px', fontWeight: 700, letterSpacing: '6px', color: '#0f172a', fontFamily: 'monospace' }}>
              {sampleData.otp_code}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>
              รหัสจะหมดอายุภายใน {sampleData.expire_minutes} นาที (กรุณาอย่าเปิดเผยรหัสแก่ผู้อื่น)
            </div>
          </div>
        </div>
      );
    } else if (activeScenario === 'event_reminder') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              padding: '16px',
              fontSize: '13px',
              color: '#334155',
              lineHeight: '1.6',
            }}
          >
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '14px', marginBottom: '6px' }}>
              {sampleData.concert_name}
            </div>
            <div>สถานที่: <strong style={{ color: '#0f172a' }}>{sampleData.location}</strong></div>
            <div>วันที่จัดแสดง: <strong style={{ color: '#0f172a' }}>{sampleData.session_date}</strong></div>
            <div>กำหนดเวลา: ประตูเปิด <strong style={{ color: '#0f172a' }}>{sampleData.door_time} น.</strong> | เริ่มแสดง <strong style={{ color: '#0f172a' }}>{sampleData.show_time} น.</strong></div>
            <div style={{ marginTop: '8px', fontSize: '11.5px', color: '#64748b', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
              ข้อแนะนำ: กรุณาเตรียมรหัส QR Code บัตรให้พร้อมสแกน ณ ประตูทางเข้า และเผื่อเวลาตรวจค้นสัมภาระ
            </div>
          </div>
        </div>
      );
    } else if (activeScenario === 'refund_approved') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '14px 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#166534', marginBottom: '10px' }}>
              สถานะ: ดำเนินการโอนเงินคืนสำเร็จเรียบร้อยแล้ว
            </div>
            <table style={{ width: '100%', fontSize: '12px', color: '#334155', borderCollapse: 'collapse', lineHeight: '1.7' }}>
              <tbody>
                <tr><td style={{ color: '#64748b' }}>รหัสคำสั่งซื้อ:</td><td style={{ textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{sampleData.order_id}</td></tr>
                <tr><td style={{ color: '#64748b' }}>ยอดเงินคืน:</td><td style={{ textAlign: 'right', fontWeight: 700, color: '#166534' }}>{sampleData.refund_amount} บาท</td></tr>
                <tr><td style={{ color: '#64748b' }}>ธนาคารปลายทาง:</td><td style={{ textAlign: 'right' }}>{sampleData.bank_name}</td></tr>
                <tr><td style={{ color: '#64748b' }}>เลขบัญชี:</td><td style={{ textAlign: 'right' }}>{sampleData.account_suffix}</td></tr>
                <tr><td style={{ color: '#64748b' }}>วันเวลาที่โอน:</td><td style={{ textAlign: 'right' }}>{sampleData.transferred_at}</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '2px' }}>
              สลิปหลักฐานการโอนเงิน (Transfer Proof Slip)
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              โอนสำเร็จจากระบบ TICKET ไปยังบัญชี {sampleData.account_suffix}
            </div>
          </div>
        </div>
      );
    } else if (activeScenario === 'refund_rejected') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#991b1b', marginBottom: '6px' }}>
              สถานะ: ไม่สามารถอนุมัติการคืนเงินได้
            </div>
            <div style={{ fontSize: '12px', color: '#7f1d1d', lineHeight: '1.5' }}>
              {sampleData.reject_reason}
            </div>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', fontSize: '12px', color: '#334155', lineHeight: '1.5' }}>
            <strong>หมายเหตุสิทธิ์บัตร:</strong> บัตรคอนเสิร์ตของท่านยังคงมีผลสมบูรณ์และสามารถนำไปใช้เข้าชมการแสดงได้ตามปกติ
          </div>
        </div>
      );
    } else if (activeScenario === 'ticket_revoked') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '8px', padding: '14px 16px', marginBottom: '12px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#9f1239', marginBottom: '6px' }}>
              แจ้งเตือน: บัตรคอนเสิร์ตถูกเพิกถอนสิทธิ์ในการเข้าชม
            </div>
            <div style={{ fontSize: '12px', color: '#881337', lineHeight: '1.5' }}>
              รหัสบัตรที่ถูกยกเลิก: <strong style={{ fontFamily: 'monospace' }}>{sampleData.ticket_codes}</strong>
            </div>
            <div style={{ fontSize: '11.5px', color: '#9f1239', marginTop: '6px' }}>
              เหตุผล: {sampleData.revoke_reason}
            </div>
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.5' }}>
            * รหัส QR Code เดิมจะไม่สามารถนำมาสแกนผ่านประตูทางเข้าได้อีกต่อไป หากท่านมีข้อสงสัยโปรดติดต่อฝ่ายบริการลูกค้า
          </div>
        </div>
      );
    } else if (activeScenario === 'event_rescheduled') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '14px 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#92400e', marginBottom: '8px' }}>
              ประกาศการเปลี่ยนแปลงกำหนดการจัดแสดง
            </div>
            <table style={{ width: '100%', fontSize: '12px', color: '#451a03', borderCollapse: 'collapse', lineHeight: '1.7' }}>
              <tbody>
                <tr><td style={{ color: '#78350f' }}>กำหนดการเดิม:</td><td style={{ textAlign: 'right', textDecoration: 'line-through', color: '#94a3b8' }}>{sampleData.old_date}</td></tr>
                <tr><td style={{ color: '#78350f', fontWeight: 600 }}>กำหนดการใหม่:</td><td style={{ textAlign: 'right', fontWeight: 700, color: '#92400e' }}>{sampleData.new_date}</td></tr>
                <tr><td style={{ color: '#78350f' }}>ยื่นขอคืนเงินภายใน:</td><td style={{ textAlign: 'right', fontWeight: 500 }}>{sampleData.refund_deadline}</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px', fontSize: '12px', color: '#334155', lineHeight: '1.5' }}>
            <strong>ตัวเลือกสำหรับผู้ถือบัตร:</strong> ท่านสามารถใช้บัตรเดิมเข้าชมในรอบใหม่ได้ทันที หรือหากไม่สะดวกสามารถยื่นขอรับเงินคืนเต็มจำนวนได้ตามกำหนดเวลาข้างต้น
          </div>
        </div>
      );
    } else if (activeScenario === 'direct_ticket') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px', fontSize: '13px', color: '#334155' }}>
            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>{sampleData.concert_name}</div>
            <div>ผู้รับมอบ: <strong style={{ color: '#0f172a' }}>{sampleData.recipient_name}</strong></div>
            <div>หมายเหตุ: <span style={{ color: '#64748b' }}>{sampleData.reference_note}</span></div>
            <div>รหัสบัตร: <code style={{ color: '#0f172a', fontWeight: 600 }}>{sampleData.ticket_code}</code></div>
          </div>
          {targetTemplate.showTicketCard && realTicketPassDataUrl ? (
            <div style={{ textAlign: 'center' }}>
              {/* biome-ignore lint/performance/noImgElement: Direct ticket preview */}
              <img
                src={realTicketPassDataUrl}
                alt="รูปบัตรคอนเสิร์ต VIP"
                style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', margin: '0 auto' }}
              />
            </div>
          ) : null}
        </div>
      );
    } else if (activeScenario === 'organizer_payout') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px 16px', marginBottom: '14px' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a', marginBottom: '8px' }}>
              สรุปยอดการโอนเงินส่วนแบ่งรายได้ ({sampleData.period})
            </div>
            <table style={{ width: '100%', fontSize: '12px', color: '#334155', borderCollapse: 'collapse', lineHeight: '1.7' }}>
              <tbody>
                <tr><td style={{ color: '#64748b' }}>ยอดขายบัตรรวม (Gross):</td><td style={{ textAlign: 'right', fontWeight: 600 }}>{sampleData.gross_sales} บาท</td></tr>
                <tr><td style={{ color: '#64748b' }}>ค่าธรรมเนียมระบบ (5%):</td><td style={{ textAlign: 'right', color: '#b91c1c' }}>-{sampleData.platform_fee} บาท</td></tr>
                <tr style={{ borderTop: '1px solid #e2e8f0' }}><td style={{ padding: '6px 0', fontWeight: 600, color: '#0f172a' }}>ยอดโอนสุทธิ (Net Payout):</td><td style={{ padding: '6px 0', textAlign: 'right', fontWeight: 700, color: '#166534', fontSize: '14px' }}>{sampleData.net_payout} บาท</td></tr>
              </tbody>
            </table>
          </div>
          <div style={{ background: '#ffffff', border: '1px dashed #cbd5e1', borderRadius: '8px', padding: '14px', textAlign: 'center' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>หลักฐานสลิปการโอนเงินเข้าบัญชีผู้จัดงาน</div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>แนบไฟล์สลิปการโอนเงินจากระบบธนาคาร</div>
          </div>
        </div>
      );
    } else if (activeScenario === 'staff_invitation') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '20px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>
              บทบาทหน้าที่ที่ได้รับมอบหมาย
            </div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: '#0f172a', marginTop: '6px' }}>
              {sampleData.role_thai}
            </div>
            <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
              คอนเสิร์ต: {sampleData.concert_name}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
              ผู้เชิญ: {sampleData.inviter_name}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '10px' }}>
              * ลิงก์คำเชิญนี้มีอายุการใช้งาน {sampleData.expire_hours} ชั่วโมง
            </div>
          </div>
        </div>
      );
    } else if (activeScenario === 'password_reset') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px', fontSize: '12.5px', color: '#334155', lineHeight: '1.6' }}>
            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '4px' }}>ข้อมูลการร้องขอความปลอดภัย</div>
            <div>เวลาที่ทำรายการ: <strong>{sampleData.request_time}</strong></div>
            <div>อายุการใช้งาน: <strong>{sampleData.expire_minutes} นาที (ใช้ได้ 1 ครั้ง)</strong></div>
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#64748b', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
              หากท่านไม่ได้เป็นผู้ส่งคำขอนี้ บัญชีของท่านอาจมีผู้พยายามเข้าถึง โปรดติดต่อฝ่ายเทคนิคทันที
            </div>
          </div>
        </div>
      );
    } else if (activeScenario === 'support_reply') {
      scenarioSpecificBlock = (
        <div style={{ padding: '0 20px', margin: '16px 0' }}>
          <div style={{ background: '#f8fafc', borderLeft: '3px solid #94a3b8', padding: '10px 14px', borderRadius: '0 6px 6px 0', marginBottom: '12px', fontSize: '12px', color: '#475569' }}>
            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '2px' }}>
              ข้อความสอบถามของท่าน (#{sampleData.ticket_id}):
            </div>
            <div>&ldquo;{sampleData.subject}&rdquo;</div>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', fontSize: '13px', color: '#334155', lineHeight: '1.6' }}>
            <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
              {sampleData.agent_name}:
            </div>
            <div>
              ยินดีให้บริการครับ ทางทีมงานขอเรียนชี้แจงว่า ท่านสามารถแสดง QR Code บัตรคอนเสิร์ตผ่านสมาร์ตโฟน ณ ประตูทางเข้าได้โดยตรง ไม่จำเป็นต้องพิมพ์ลงบนกระดาษครับ หากต้องการความช่วยเหลือเพิ่มเติม สามารถตอบกลับอีเมลนี้ได้ทันทีครับ
            </div>
          </div>
        </div>
      );
    }

    const order = normalizeEmailSectionOrder(targetTemplate.sectionOrder);
    const sectionNodes: Record<EmailSectionKey, React.ReactNode> = {
      poster: posterBlock,
      body: bodyBlock,
      pass: passBlock,
    };

    return (
      <div
        style={{
          width: isMobileView ? '375px' : '600px',
          maxWidth: '100%',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
          boxSizing: 'border-box',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        {/* Header Strip - Pure White */}
        <div
          style={{
            background: '#ffffff',
            color: '#0f172a',
            padding: '16px 20px',
            borderBottom: '1px solid #e2e8f0',
          }}
        >
          <div style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '0.3px' }}>
            {targetTemplate.headerTitle || currentScenarioDef.name}
          </div>
        </div>

        {/* Ordered Card Content Area */}
        <div style={{ paddingBottom: '20px' }}>
          {activeScenario === 'ticket_delivery' ? (
            order.map((key) => sectionNodes[key])
          ) : (
            <>
              {posterBlock}
              {bodyBlock}
              {scenarioSpecificBlock}
            </>
          )}

          {/* Action Button */}
          <div style={{ padding: '0 20px' }}>
            <div
              style={{
                textAlign:
                  targetTemplate.primaryButtonAlign === 'left'
                    ? 'left'
                    : targetTemplate.primaryButtonAlign === 'right'
                    ? 'right'
                    : 'center',
                margin: '24px 0 16px',
                display: 'flex',
                flexDirection: targetTemplate.primaryButtonAlign === 'full' ? 'column' : 'row',
                alignItems: 'center',
                justifyContent:
                  targetTemplate.primaryButtonAlign === 'left'
                    ? 'flex-start'
                    : targetTemplate.primaryButtonAlign === 'right'
                    ? 'flex-end'
                    : 'center',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                className="email-preview-action-btn"
                onClick={() => handleTestButtonClick(targetTemplate.primaryButtonText, primaryBtnTarget)}
                style={{
                  display: targetTemplate.primaryButtonAlign === 'full' ? 'block' : 'inline-block',
                  width: targetTemplate.primaryButtonAlign === 'full' ? '100%' : 'auto',
                  background: targetTemplate.primaryButtonColor || '#0f172a',
                  color: targetTemplate.primaryButtonTextColor || '#ffffff',
                  padding: '11px 22px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'opacity 0.15s ease',
                }}
                title={`คลิกเพื่อทดสอบนำทางไปยัง ${primaryBtnTarget}`}
              >
                {activeScenario === 'ticket_delivery' && previewTicketCount === 25
                  ? `${targetTemplate.primaryButtonText || 'เปิดดูและดาวน์โหลดบัตรทั้งหมด'} (25 ใบ)`
                  : targetTemplate.primaryButtonText}
              </button>
            </div>

            {/* Footer Disclaimer */}
            <div
              style={{
                fontSize: '11px',
                color: '#64748b',
                lineHeight: '1.6',
                borderTop: '1px solid #f1f5f9',
                paddingTop: '14px',
                whiteSpace: 'pre-wrap',
              }}
            >
              {previewFooter}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="email-designer-hub">
      {/* 1. Header Row */}
      <div className="hub-top-bar">
        <div>
          <h2 className="pipeline-title">ออกแบบและเขียนอีเมลส่งบัตร (Email Designer)</h2>
          <p className="pipeline-subtitle">
            กำหนดโปสเตอร์ รูปบัตรคอนเสิร์ตจริง เนื้อหา ปุ่มกด และพรีวิวเสมือนจริงของอีเมลแจ้งเตือนทุกสถานการณ์ในระบบ
          </p>
        </div>

        <div className="hub-toolbar-tools-right">
          <button
            type="button"
            className="secondary-button"
            onClick={handleManualRefresh}
            disabled={isLoading}
            aria-label="รีเฟรชข้อมูลเทมเพลต"
            title="รีเฟรชข้อมูลเทมเพลต"
            style={{ height: '38px' }}
          >
            <RefreshIcon className={`btn-icon ${isLoading ? 'spinning' : ''}`} style={{ width: 15, height: 15 }} />
            <span>รีเฟรช</span>
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setTestResult(null);
              setTestModalOpen(true);
            }}
            style={{ height: '38px' }}
            title="ส่งอีเมลทดสอบไปยังกล่องข้อความจริง"
          >
            <MailIcon style={{ width: 15, height: 15 }} />
            <span>ส่งอีเมลทดสอบ</span>
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={handleOpenEditModal}
            style={{ height: '38px', background: '#0f172a', color: '#ffffff' }}
            title="เปิดหน้าต่างแก้ไขข้อความและองค์ประกอบอีเมล"
          >
            <SlidersIcon style={{ width: 15, height: 15 }} />
            <span>แก้ไขเทมเพลต</span>
          </button>
        </div>
      </div>

      {/* 2. Scenario Selector Card (Category Tabs + Scenario Dropdown) */}
      <div
        className="email-scenario-selector-card"
        style={{
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          padding: '1rem',
          marginBottom: '1rem',
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        }}
      >
        <div style={{ marginBottom: '0.85rem' }}>
          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#64748b',
              marginBottom: '0.5rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            หมวดหมู่ประเภทอีเมล
          </div>
          <div className="hub-filter-tabs-bar" role="tablist" aria-label="หมวดหมู่ประเภทอีเมล">
            {EMAIL_SCENARIO_CATEGORIES.map((cat) => {
              const count = getScenariosByCategory(cat.id).length;
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`hub-filter-tab ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectCategory(cat.id)}
                  style={{ height: '38px' }}
                >
                  <span>{cat.name} ({count})</span>
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap', flex: 1 }}>
            <label htmlFor={scenarioSelectId} style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>
              ประเภทอีเมล:
            </label>
            <select
              id={scenarioSelectId}
              value={activeScenario}
              onChange={(e) => handleSelectScenario(e.target.value as EmailScenarioKey)}
              style={{
                minWidth: '260px',
                height: '38px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                padding: '0 12px',
                fontSize: '0.85rem',
                background: '#ffffff',
                color: '#0f172a',
                fontWeight: 500,
              }}
            >
              {categoryScenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <span
              style={{
                fontSize: '0.8rem',
                color: '#475569',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                padding: '6px 12px',
                lineHeight: '1.4',
              }}
            >
              {currentScenarioDef.description}
            </span>
          </div>

          {activeScenario !== 'ticket_delivery' && (
            <button
              type="button"
              className="secondary-button"
              onClick={handleResetScenarioToDefault}
              style={{ height: '38px', fontSize: '0.82rem' }}
              title="คืนค่าเทมเพลตของกรณีนี้กลับสู่ค่ามาตรฐานของระบบ"
            >
              <span>คืนค่าเริ่มต้นของกรณีนี้</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Preset Toolbar & Grounded Tabs */}
      <div
        className="hub-toolbar-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
          padding: '0.6rem 0.85rem',
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label htmlFor={presetSelectId} style={{ fontSize: '0.85rem', fontWeight: 500, color: '#334155' }}>
            เทมเพลต:
          </label>
          <select
            id={presetSelectId}
            value={currentActivePresetId}
            onChange={(e) => handleSelectPreset(e.target.value)}
            className="email-preset-dropdown"
            style={{
              minWidth: '220px',
              height: '38px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              padding: '0 10px',
              fontSize: '0.85rem',
              background: '#ffffff',
              color: '#0f172a',
            }}
          >
            {currentScenarioPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setNewTemplateName('');
              setAddTemplateModalOpen(true);
            }}
            style={{ height: '38px' }}
            title={`สร้างเทมเพลตใหม่สำหรับ ${currentScenarioDef.name}`}
          >
            <PlusIcon style={{ width: 14, height: 14 }} />
            <span>เพิ่มเทมเพลต</span>
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              const cur = currentScenarioPresets.find((p) => p.id === currentActivePresetId);
              setRenameValue(cur?.name || '');
              setRenameModalOpen(true);
            }}
            style={{ height: '38px' }}
            title="แก้ไขชื่อเทมเพลตนี้"
          >
            <span>แก้ไขชื่อ</span>
          </button>

          <button
            type="button"
            className="secondary-button"
            onClick={handleDeleteActiveTemplate}
            disabled={currentScenarioPresets.length <= 1}
            style={{ height: '38px', color: currentScenarioPresets.length <= 1 ? '#94a3b8' : '#b91c1c' }}
            title={currentScenarioPresets.length <= 1 ? 'ต้องมีเทมเพลตในแต่ละกรณีอย่างน้อย 1 แบบ' : 'ลบเทมเพลตนี้'}
          >
            <span>ลบ</span>
          </button>
        </div>

        {/* Grounded Navigation Tabs (.hub-filter-tabs-bar) */}
        <div className="hub-filter-tabs-bar" role="tablist" aria-label="สลับมุมมองหน้าออกแบบอีเมล">
          <button
            type="button"
            role="tab"
            aria-selected={activeCanvasView === 'settings'}
            className={`hub-filter-tab ${activeCanvasView === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveCanvasView('settings')}
            style={{ height: '38px' }}
          >
            <span>รายละเอียดการตั้งค่าเทมเพลต</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeCanvasView === 'preview'}
            className={`hub-filter-tab ${activeCanvasView === 'preview' ? 'active' : ''}`}
            onClick={() => setActiveCanvasView('preview')}
            style={{ height: '38px' }}
          >
            <span>ตัวอย่างการแสดงผลอีเมลจริง</span>
          </button>
        </div>
      </div>

      {/* 4. 4 Clean White KPI Cards */}
      <div className="direct-kpi-grid">
        <div className="direct-kpi-card" style={{ background: '#ffffff', borderColor: '#e2e8f0' }}>
          <div className="direct-kpi-head">
            <span className="direct-kpi-label">ประเภทอีเมลที่เลือก</span>
            <ShieldCheckIcon style={{ width: 17, height: 17, color: '#0f172a' }} />
          </div>
          <div className="direct-kpi-value" style={{ fontSize: '1.05rem', fontWeight: 500, color: '#0f172a' }}>
            {currentScenarioDef.name}
          </div>
          <div className="direct-kpi-sub">หมวดหมู่: {currentCategoryDef?.name || 'ลูกค้า'}</div>
        </div>

        <div className="direct-kpi-card" style={{ background: '#ffffff', borderColor: '#e2e8f0' }}>
          <div className="direct-kpi-head">
            <span className="direct-kpi-label">หัวข้ออีเมล (Subject)</span>
            <MailIcon style={{ width: 17, height: 17, color: '#64748b' }} />
          </div>
          <div
            className="direct-kpi-value"
            style={{
              fontSize: '0.95rem',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: '#0f172a',
            }}
            title={template.subject}
          >
            {template.subject}
          </div>
          <div className="direct-kpi-sub">รองรับตัวแปรแทรกเฉพาะกรณี</div>
        </div>

        <div className="direct-kpi-card" style={{ background: '#ffffff', borderColor: '#e2e8f0' }}>
          <div className="direct-kpi-head">
            <span className="direct-kpi-label">องค์ประกอบการแสดงผล</span>
            <QrCodeIcon style={{ width: 17, height: 17, color: '#0f172a' }} />
          </div>
          <div
            className="direct-kpi-value"
            style={{
              fontSize: '1.05rem',
              fontWeight: 500,
              color: '#0f172a',
            }}
          >
            {activeScenario === 'ticket_delivery'
              ? (template.showTicketCard ? 'ภาพบัตรจริง (1-20 ใบ)' : 'ตารางรหัสบัตร')
              : currentScenarioDef.shortLabel}
          </div>
          <div className="direct-kpi-sub">
            {template.showConcertPoster !== false ? 'เปิดแสดงโปสเตอร์แนวยาว' : 'ปิดภาพโปสเตอร์'}
          </div>
        </div>

        <div className="direct-kpi-card" style={{ background: '#ffffff', borderColor: '#e2e8f0' }}>
          <div className="direct-kpi-head">
            <span className="direct-kpi-label">ปุ่มดำเนินการ (CTA)</span>
            <CheckCircleIcon style={{ width: 17, height: 17, color: '#0f172a' }} />
          </div>
          <div
            className="direct-kpi-value"
            style={{
              fontSize: '1.05rem',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: '#0f172a',
            }}
          >
            {template.primaryButtonText}
          </div>
          <div className="direct-kpi-sub">ปุ่มดำเนินการหลัก (Single CTA)</div>
        </div>
      </div>

      {/* 5. Tab 1 Content: Clean Settings Overview */}
      {activeCanvasView === 'settings' && (
        <div className="email-overview-card" style={{ background: '#ffffff', borderColor: '#e2e8f0' }}>
          <div className="email-overview-header">
            <div>
              <h3 className="email-overview-title" style={{ color: '#0f172a' }}>
                ภาพรวมการตั้งค่าเทมเพลต: {currentScenarioDef.name}
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                {currentScenarioDef.description}
              </p>
            </div>
          </div>

          <div className="email-overview-grid">
            <div className="email-overview-item">
              <div className="email-overview-label">1. หัวข้ออีเมล (Subject Line)</div>
              <div className="email-overview-val" style={{ fontWeight: 500, color: '#0f172a' }}>
                {template.subject}
              </div>
            </div>

            <div className="email-overview-item">
              <div className="email-overview-label">2. ข้อความบนแถบหัวเรื่อง (Header Title)</div>
              <div className="email-overview-val">{template.headerTitle || currentScenarioDef.name}</div>
            </div>

            <div className="email-overview-item">
              <div className="email-overview-label">3. ภาพโปสเตอร์คอนเสิร์ตแนวนอน</div>
              <div className="email-overview-val">
                {template.showConcertPoster !== false ? 'เปิดแสดงภาพโปสเตอร์แนวยาว (ความสูง 220px)' : 'ปิดการแสดงภาพโปสเตอร์'}
              </div>
            </div>

            <div className="email-overview-item">
              <div className="email-overview-label">4. องค์ประกอบเฉพาะของกรณีนี้</div>
              <div className="email-overview-val">
                {activeScenario === 'ticket_delivery'
                  ? (template.showTicketCard ? 'เปิดแสดงภาพบัตรคอนเสิร์ตจริงของลูกค้า (PNG)' : 'ไม่แสดงรูปภาพบัตร')
                  : currentScenarioDef.description}
              </div>
            </div>

            {activeScenario === 'ticket_delivery' && (
              <div className="email-overview-item" style={{ gridColumn: 'span 2' }}>
                <div className="email-overview-label">5. ลำดับการแสดงผลในอีเมล (Section Order)</div>
                <div className="email-overview-val" style={{ fontWeight: 500 }}>
                  {formatSectionOrderLabel(template.sectionOrder)}
                </div>
              </div>
            )}

            <div className="email-overview-item" style={{ gridColumn: 'span 2' }}>
              <div className="email-overview-label">
                {activeScenario === 'ticket_delivery' ? '6. เนื้อความหลัก (Main Body Content)' : '5. เนื้อความหลัก (Main Body Content)'}
              </div>
              <div className="email-overview-val" style={{ lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                {template.bodyText}
              </div>
            </div>

            <div className="email-overview-item">
              <div className="email-overview-label">
                {activeScenario === 'ticket_delivery' ? '7. ปุ่มดำเนินการหลัก (Primary CTA)' : '6. ปุ่มดำเนินการหลัก (Primary CTA)'}
              </div>
              <div className="email-overview-val">
                <span>{template.primaryButtonText}</span>
                <span style={{ color: '#64748b', fontSize: '0.8rem', marginLeft: '8px' }}>
                  (พื้นหลัง: {template.primaryButtonColor}, อักษร: {template.primaryButtonTextColor || '#ffffff'})
                </span>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                  ลิงก์: {activePrimaryBtnTarget}
                </div>
              </div>
            </div>

            <div className="email-overview-item">
              <div className="email-overview-label">
                {activeScenario === 'ticket_delivery' ? '8. ตัวแปรเฉพาะของกรณีนี้ (Merge Tags)' : '7. ตัวแปรเฉพาะของกรณีนี้ (Merge Tags)'}
              </div>
              <div className="email-overview-val" style={{ fontSize: '0.82rem', color: '#475569', lineHeight: '1.5' }}>
                {currentScenarioDef.mergeTags.map((m) => m.tag).join(', ')}
              </div>
            </div>

            <div className="email-overview-item" style={{ gridColumn: 'span 2' }}>
              <div className="email-overview-label">
                {activeScenario === 'ticket_delivery' ? '9. ข้อความหมายเหตุส่วนท้าย (Footer Disclaimer)' : '8. ข้อความหมายเหตุส่วนท้าย (Footer Disclaimer)'}
              </div>
              <div className="email-overview-val" style={{ fontSize: '0.82rem', color: '#64748b', whiteSpace: 'pre-wrap' }}>
                {template.footerNotes}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Tab 2 Content: Live Email Preview with Docked Header Bar */}
      {activeCanvasView === 'preview' && (
        <div className="email-preview-shell">
          <div className="email-preview-docked-header">
            {activeScenario === 'ticket_delivery' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>จำลองจำนวนบัตร:</span>
                <div className="email-preview-mode-switch">
                  <button
                    type="button"
                    aria-pressed={previewTicketCount === 1}
                    onClick={() => setPreviewTicketCount(1)}
                    className={`email-preview-mode-btn ${previewTicketCount === 1 ? 'active' : ''}`}
                  >
                    1 ใบ
                  </button>
                  <button
                    type="button"
                    aria-pressed={previewTicketCount === 2}
                    onClick={() => setPreviewTicketCount(2)}
                    className={`email-preview-mode-btn ${previewTicketCount === 2 ? 'active' : ''}`}
                  >
                    2 ใบ
                  </button>
                  <button
                    type="button"
                    aria-pressed={previewTicketCount === 25}
                    onClick={() => setPreviewTicketCount(25)}
                    className={`email-preview-mode-btn ${previewTicketCount === 25 ? 'active' : ''}`}
                  >
                    เกินโควตา (25 ใบ)
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.82rem', color: '#0f172a', fontWeight: 600 }}>
                  ตัวอย่าง: {currentScenarioDef.name}
                </span>
                <span style={{ fontSize: '0.78rem', color: '#64748b', background: '#f8fafc', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                  {currentCategoryDef?.name}
                </span>
              </div>
            )}

            <div className="email-preview-mode-switch">
              <button
                type="button"
                aria-pressed={previewDevice === 'desktop'}
                onClick={() => setPreviewDevice('desktop')}
                className={`email-preview-mode-btn ${previewDevice === 'desktop' ? 'active' : ''}`}
              >
                Desktop (600px)
              </button>
              <button
                type="button"
                aria-pressed={previewDevice === 'mobile'}
                onClick={() => setPreviewDevice('mobile')}
                className={`email-preview-mode-btn ${previewDevice === 'mobile' ? 'active' : ''}`}
              >
                Mobile (375px)
              </button>
            </div>
          </div>

          <div className="email-preview-canvas-stage">
            {renderSimulatedEmailCard(template, previewDevice === 'mobile')}
          </div>
        </div>
      )}

      {/* MODAL 1: Split-Pane Edit Template Modal with Live Preview */}
      {editModalOpen && (
        <div className="direct-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-template-title">
          <button
            type="button"
            className="email-modal-close-btn"
            aria-label="ปิดหน้าต่างแก้ไขเทมเพลต"
            tabIndex={-1}
            onClick={() => setEditModalOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'default',
              zIndex: 0,
            }}
          />
          <div className="direct-modal-card email-split-modal-card" style={{ position: 'relative', zIndex: 1 }}>
            <div className="direct-modal-header">
              <div>
                <h3 id="edit-template-title" className="direct-modal-title">
                  แก้ไขเทมเพลต: {currentScenarioDef.name}
                </h3>
                <p className="direct-modal-subtitle">
                  {currentScenarioDef.description}
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {/* Split-Pane Body: Left Form (48%) | Right Live Preview (52%) */}
            <div className="email-split-modal-body">
              {/* Left Column: 4 Category Tabs + Scrollable Form */}
              <div className="email-split-left">
                <div className="email-modal-tabs-bar" role="tablist" aria-label="หมวดหมู่การตั้งค่าเทมเพลต">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeModalCategory === 1}
                    className={`email-modal-tab-btn ${activeModalCategory === 1 ? 'active' : ''}`}
                    onClick={() => setActiveModalCategory(1)}
                  >
                    1. ข้อมูลเทมเพลต &amp; หัวเรื่อง
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeModalCategory === 2}
                    className={`email-modal-tab-btn ${activeModalCategory === 2 ? 'active' : ''}`}
                    onClick={() => setActiveModalCategory(2)}
                  >
                    2. รูปภาพ บัตรจริง &amp; ย้ายลำดับ
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeModalCategory === 3}
                    className={`email-modal-tab-btn ${activeModalCategory === 3 ? 'active' : ''}`}
                    onClick={() => setActiveModalCategory(3)}
                  >
                    3. เนื้อหา &amp; ตัวแปร
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeModalCategory === 4}
                    className={`email-modal-tab-btn ${activeModalCategory === 4 ? 'active' : ''}`}
                    onClick={() => setActiveModalCategory(4)}
                  >
                    4. สไตล์ปุ่มดำเนินการ
                  </button>
                </div>

                <div className="email-split-left-scroll">
                  {/* CATEGORY 1: ข้อมูลเทมเพลต & หัวเรื่อง */}
                  {activeModalCategory === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label className="email-designer-label" style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>
                          <span>หัวข้ออีเมล (Subject Line)</span>
                          <input
                            ref={subjectInputRef}
                            type="text"
                            className="email-designer-input"
                            value={draftTemplate.subject}
                            onFocus={() => setActiveInput('subject')}
                            onChange={(e) => setDraftTemplate({ ...draftTemplate, subject: e.target.value })}
                            placeholder="ระบุหัวข้ออีเมล..."
                            style={{
                              width: '100%',
                              height: '38px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              marginTop: '4px',
                            }}
                          />
                        </label>
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '4px' }}>
                          รองรับตัวแปรแทรก เช่น <code>&#123;&#123;order_id&#125;&#125;</code>, <code>&#123;&#123;concert_name&#125;&#125;</code>
                        </span>
                      </div>

                      <div>
                        <label className="email-designer-label" style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>
                          <span>ข้อความบนแถบหัวเรื่อง (Header Title)</span>
                          <input
                            type="text"
                            className="email-designer-input"
                            value={draftTemplate.headerTitle}
                            onChange={(e) => setDraftTemplate({ ...draftTemplate, headerTitle: e.target.value })}
                            placeholder={currentScenarioDef.name}
                            style={{
                              width: '100%',
                              height: '38px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              marginTop: '4px',
                            }}
                          />
                        </label>
                      </div>

                      <div>
                        <label className="email-designer-label" style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>
                          <span>ข้อความพรีเฮดเดอร์ (Preheader)</span>
                          <input
                            type="text"
                            className="email-designer-input"
                            value={draftTemplate.preheader}
                            onChange={(e) => setDraftTemplate({ ...draftTemplate, preheader: e.target.value })}
                            placeholder="ข้อความสรุปที่จะแสดงข้างหัวข้อในกล่องจดหมาย"
                            style={{
                              width: '100%',
                              height: '38px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              marginTop: '4px',
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 2: รูปภาพ บัตรจริง & ย้ายลำดับ */}
                  {activeModalCategory === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
                      {activeScenario === 'ticket_delivery' && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem', marginBottom: '4px' }}>
                            จัดเรียงลำดับบล็อกในอีเมล (กดขึ้น / ลง เพื่อย้ายได้อิสระ)
                          </div>
                          <div style={{ fontSize: '0.76rem', color: '#64748b', marginBottom: '10px' }}>
                            ตัวอย่างฝั่งขวาจะสลับตำแหน่งตามลำดับนี้ทันที
                          </div>
                          <div className="email-reorder-list">
                            {normalizeEmailSectionOrder(draftTemplate.sectionOrder).map((key, index) => {
                              const meta = SECTION_META[key];
                              return (
                                <div
                                  key={key}
                                  className="email-reorder-item"
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    marginBottom: '6px',
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#0f172a' }}>
                                      {index + 1}. {meta.title}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{meta.subtitle}</div>
                                  </div>
                                  <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                      type="button"
                                      className="secondary-button email-reorder-btn"
                                      onClick={() => handleMoveSection(index, -1)}
                                      disabled={index === 0}
                                      style={{ height: '28px', padding: '0 8px' }}
                                      title="เลื่อนขึ้น"
                                    >
                                      <ChevronUpIcon style={{ width: 14, height: 14 }} />
                                    </button>
                                    <button
                                      type="button"
                                      className="secondary-button email-reorder-btn"
                                      onClick={() => handleMoveSection(index, 1)}
                                      disabled={index === 2}
                                      style={{ height: '28px', padding: '0 8px' }}
                                      title="เลื่อนลง"
                                    >
                                      <ChevronDownIcon style={{ width: 14, height: 14 }} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Poster Toggle */}
                      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem' }}>
                              ภาพโปสเตอร์คอนเสิร์ตแนวนอน (Landscape Poster)
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                              ภาพเต็มขอบแนวนอนความสูง 220px ล้วน ไม่มีข้อความซ้อนทับ
                            </div>
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', flexShrink: 0 }}>
                            <input
                              type="checkbox"
                              checked={draftTemplate.showConcertPoster !== false}
                              onChange={(e) => setDraftTemplate({ ...draftTemplate, showConcertPoster: e.target.checked })}
                            />
                            <span>เปิดภาพโปสเตอร์</span>
                          </label>
                        </div>
                        {draftTemplate.showConcertPoster !== false && (
                          <div style={{ marginTop: '10px' }}>
                            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                              <span>URL ภาพโปสเตอร์ (เว้นว่างไว้เพื่อใช้รูปคอนเสิร์ตจริง):</span>
                              <input
                                type="url"
                                value={draftTemplate.posterUrl || ''}
                                onChange={(e) => setDraftTemplate({ ...draftTemplate, posterUrl: e.target.value })}
                                placeholder="https://..."
                                style={{
                                  width: '100%',
                                  height: '38px',
                                  padding: '0 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                  marginTop: '4px',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>

                      {/* Ticket Pass Toggle (Only for ticket delivery or direct tickets) */}
                      {(activeScenario === 'ticket_delivery' || activeScenario === 'direct_ticket') && (
                        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div>
                              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem' }}>
                                รูปบัตรคอนเสิร์ตจริงของลูกค้า (Buyer Ticket Pass Image)
                              </div>
                              <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                                แสดงภาพบัตรคอนเสิร์ตความละเอียดสูงจริงที่ออกโดยระบบ พร้อมบาร์โค้ดและข้อมูลที่นั่ง
                              </div>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', flexShrink: 0 }}>
                              <input
                                type="checkbox"
                                checked={draftTemplate.showTicketCard}
                                onChange={(e) => setDraftTemplate({ ...draftTemplate, showTicketCard: e.target.checked })}
                              />
                              <span>เปิดแสดงรูปบัตรจริง</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CATEGORY 3: เนื้อหา & ตัวแปร */}
                  {activeModalCategory === 3 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {/* Dynamic Merge Tag Chips for Active Scenario */}
                      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0f172a', marginBottom: '6px' }}>
                          คลิกเพื่อแทรกตัวแปรลงในข้อความ ({currentScenarioDef.name}):
                        </div>
                        <div className="email-variable-chips-grid">
                          {currentScenarioDef.mergeTags.map((mt) => (
                            <button
                              key={mt.tag}
                              type="button"
                              className="email-variable-chip-btn"
                              onClick={() => handleInsertTag(mt.tag)}
                              title={`แทรก ${mt.tag} (${mt.label})`}
                            >
                              <code>{mt.tag}</code>
                              <span>{mt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="email-designer-label" style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>
                          <span>คำทักทาย (Greeting Text)</span>
                          <input
                            ref={greetingInputRef}
                            type="text"
                            className="email-designer-input"
                            value={draftTemplate.greetingText}
                            onFocus={() => setActiveInput('greeting')}
                            onChange={(e) => setDraftTemplate({ ...draftTemplate, greetingText: e.target.value })}
                            placeholder="เรียนคุณ {{buyer_name}},"
                            style={{
                              width: '100%',
                              height: '38px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              marginTop: '4px',
                            }}
                          />
                        </label>
                      </div>

                      <div>
                        <label className="email-designer-label" style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>
                          <span>เนื้อความหลัก (Main Body Content)</span>
                          <textarea
                            ref={bodyInputRef}
                            rows={5}
                            className="email-designer-textarea"
                            value={draftTemplate.bodyText}
                            onFocus={() => setActiveInput('body')}
                            onChange={(e) => setDraftTemplate({ ...draftTemplate, bodyText: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              lineHeight: '1.6',
                              marginTop: '4px',
                            }}
                          />
                        </label>
                      </div>

                      <div>
                        <label className="email-designer-label" style={{ fontWeight: 600, color: '#0f172a', display: 'block' }}>
                          <span>ข้อความหมายเหตุส่วนท้าย (Footer Notes)</span>
                          <textarea
                            rows={3}
                            className="email-designer-textarea"
                            value={draftTemplate.footerNotes}
                            onChange={(e) => setDraftTemplate({ ...draftTemplate, footerNotes: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '10px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              lineHeight: '1.5',
                              marginTop: '4px',
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* CATEGORY 4: สไตล์ปุ่มดำเนินการ */}
                  {activeModalCategory === 4 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '10px' }}>
                          ปุ่มดำเนินการหลัก (Primary Button)
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                          <div>
                            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                              <span>ข้อความบนปุ่ม</span>
                              <input
                                type="text"
                                value={draftTemplate.primaryButtonText}
                                onChange={(e) => setDraftTemplate({ ...draftTemplate, primaryButtonText: e.target.value })}
                                style={{
                                  width: '100%',
                                  height: '38px',
                                  padding: '0 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                  marginTop: '4px',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </label>
                          </div>

                          <div>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                              สีพื้นหลังปุ่ม
                            </span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                type="color"
                                aria-label="เลือกสีพื้นหลังปุ่มหลัก"
                                value={draftTemplate.primaryButtonColor || '#0f172a'}
                                onChange={(e) => setDraftTemplate({ ...draftTemplate, primaryButtonColor: e.target.value })}
                                style={{
                                  width: '42px',
                                  height: '38px',
                                  padding: '2px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  cursor: 'pointer',
                                }}
                              />
                              <input
                                type="text"
                                aria-label="รหัสสีพื้นหลังปุ่มหลัก"
                                value={draftTemplate.primaryButtonColor || '#0f172a'}
                                onChange={(e) => setDraftTemplate({ ...draftTemplate, primaryButtonColor: e.target.value })}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  height: '38px',
                                  padding: '0 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            <span style={{ fontSize: '0.8rem', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                              สีตัวอักษรในปุ่ม
                            </span>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input
                                type="color"
                                aria-label="เลือกสีตัวอักษรในปุ่มหลัก"
                                value={draftTemplate.primaryButtonTextColor || '#ffffff'}
                                onChange={(e) => setDraftTemplate({ ...draftTemplate, primaryButtonTextColor: e.target.value })}
                                style={{
                                  width: '42px',
                                  height: '38px',
                                  padding: '2px',
                                  borderRadius: '6px',
                                  border: '1px solid #cbd5e1',
                                  cursor: 'pointer',
                                }}
                              />
                              <input
                                type="text"
                                aria-label="รหัสสีตัวอักษรในปุ่มหลัก"
                                value={draftTemplate.primaryButtonTextColor || '#ffffff'}
                                onChange={(e) => setDraftTemplate({ ...draftTemplate, primaryButtonTextColor: e.target.value })}
                                style={{
                                  flex: 1,
                                  minWidth: 0,
                                  height: '38px',
                                  padding: '0 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                }}
                              />
                            </div>
                          </div>

                          <div>
                            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                              <span>การจัดตำแหน่งปุ่ม</span>
                              <select
                                value={draftTemplate.primaryButtonAlign || 'center'}
                                onChange={(e) =>
                                  setDraftTemplate({
                                    ...draftTemplate,
                                    primaryButtonAlign: e.target.value as EmailTemplateState['primaryButtonAlign'],
                                  })
                                }
                                style={{
                                  width: '100%',
                                  height: '38px',
                                  borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                  padding: '0 10px',
                                  marginTop: '4px',
                                  background: '#ffffff',
                                }}
                              >
                                <option value="center">กึ่งกลาง (Center)</option>
                                <option value="left">ชิดซ้าย (Left)</option>
                                <option value="right">ชิดขวา (Right)</option>
                                <option value="full">เต็มความกว้าง (Full Width)</option>
                              </select>
                            </label>
                          </div>

                          <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ fontSize: '0.8rem', color: '#64748b', display: 'block' }}>
                              <span>ลิงก์ URL ปลายทาง (รองรับตัวแปร)</span>
                              <input
                                type="text"
                                value={draftTemplate.primaryButtonUrl || ''}
                                onChange={(e) => setDraftTemplate({ ...draftTemplate, primaryButtonUrl: e.target.value })}
                                placeholder="/orders/{{order_id}}/success"
                                style={{
                                  width: '100%',
                                  height: '38px',
                                  padding: '0 10px',
                                  borderRadius: '8px',
                                  border: '1px solid #cbd5e1',
                                  marginTop: '4px',
                                  boxSizing: 'border-box',
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>
                      {/* Single CTA Mode: Secondary button removed per owner requirement */}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Live Email Preview updating immediately as user edits */}
              <div className="email-split-right">
                <div className="email-preview-docked-header">
                  {activeScenario === 'ticket_delivery' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.8rem', color: '#64748b' }}>จำลองบัตร:</span>
                      <div className="email-preview-mode-switch">
                        <button
                          type="button"
                          aria-pressed={previewTicketCount === 1}
                          onClick={() => setPreviewTicketCount(1)}
                          className={`email-preview-mode-btn ${previewTicketCount === 1 ? 'active' : ''}`}
                        >
                          1 ใบ
                        </button>
                        <button
                          type="button"
                          aria-pressed={previewTicketCount === 2}
                          onClick={() => setPreviewTicketCount(2)}
                          className={`email-preview-mode-btn ${previewTicketCount === 2 ? 'active' : ''}`}
                        >
                          2 ใบ
                        </button>
                        <button
                          type="button"
                          aria-pressed={previewTicketCount === 25}
                          onClick={() => setPreviewTicketCount(25)}
                          className={`email-preview-mode-btn ${previewTicketCount === 25 ? 'active' : ''}`}
                        >
                          &gt; 20 ใบ
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: '#0f172a', fontWeight: 600 }}>
                      ตัวอย่าง: {currentScenarioDef.shortLabel}
                    </span>
                  )}
                  <div className="email-preview-mode-switch">
                    <button
                      type="button"
                      aria-pressed={modalPreviewDevice === 'desktop'}
                      onClick={() => setModalPreviewDevice('desktop')}
                      className={`email-preview-mode-btn ${modalPreviewDevice === 'desktop' ? 'active' : ''}`}
                    >
                      Desktop
                    </button>
                    <button
                      type="button"
                      aria-pressed={modalPreviewDevice === 'mobile'}
                      onClick={() => setModalPreviewDevice('mobile')}
                      className={`email-preview-mode-btn ${modalPreviewDevice === 'mobile' ? 'active' : ''}`}
                    >
                      Mobile
                    </button>
                  </div>
                </div>

                <div className="email-split-right-scroll">
                  {renderSimulatedEmailCard(draftTemplate, modalPreviewDevice === 'mobile')}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="direct-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={handleResetDraft}
                style={{ height: '38px' }}
              >
                คืนค่าเริ่มต้น
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditModalOpen(false)}
                  style={{ height: '38px' }}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleSaveDraftChanges}
                  disabled={isSaving}
                  style={{ height: '38px', background: '#0f172a', color: '#ffffff' }}
                >
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Add Preset Modal */}
      {addTemplateModalOpen && (
        <div className="direct-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-template-title">
          <button
            type="button"
            className="email-modal-close-btn"
            aria-label="ปิดหน้าต่างเพิ่มเทมเพลต"
            tabIndex={-1}
            onClick={() => setAddTemplateModalOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'default',
              zIndex: 0,
            }}
          />
          <div className="direct-modal-card compact" style={{ position: 'relative', zIndex: 1 }}>
            <div className="direct-modal-header">
              <div>
                <h3 id="add-template-title" className="direct-modal-title">
                  สร้างเทมเพลตใหม่
                </h3>
                <p className="direct-modal-subtitle">
                  บันทึกการตั้งค่าปัจจุบันเป็นเทมเพลตใหม่สำหรับ: {currentScenarioDef.name}
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setAddTemplateModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div className="direct-modal-body">
              <label style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 500, display: 'block' }}>
                <span>ชื่อเทมเพลต:</span>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="เช่น เทมเพลตสำหรับงาน Festival..."
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    marginTop: '6px',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>
            <div className="direct-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAddTemplateModalOpen(false)}
                style={{ height: '38px' }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleCreateNewTemplate}
                style={{ height: '38px', background: '#0f172a', color: '#ffffff' }}
              >
                สร้างเทมเพลต
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Rename Preset Modal */}
      {renameModalOpen && (
        <div className="direct-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="rename-template-title">
          <button
            type="button"
            className="email-modal-close-btn"
            aria-label="ปิดหน้าต่างเปลี่ยนชื่อเทมเพลต"
            tabIndex={-1}
            onClick={() => setRenameModalOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'default',
              zIndex: 0,
            }}
          />
          <div className="direct-modal-card compact" style={{ position: 'relative', zIndex: 1 }}>
            <div className="direct-modal-header">
              <div>
                <h3 id="rename-template-title" className="direct-modal-title">
                  แก้ไขชื่อเทมเพลต
                </h3>
                <p className="direct-modal-subtitle">
                  เปลี่ยนชื่อเทมเพลตปัจจุบันของ: {currentScenarioDef.name}
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setRenameModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div className="direct-modal-body">
              <label style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 500, display: 'block' }}>
                <span>ชื่อเทมเพลต:</span>
                <input
                  type="text"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    marginTop: '6px',
                    boxSizing: 'border-box',
                  }}
                />
              </label>
            </div>
            <div className="direct-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRenameModalOpen(false)}
                style={{ height: '38px' }}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleRenameCurrentTemplate}
                style={{ height: '38px', background: '#0f172a', color: '#ffffff' }}
              >
                บันทึกชื่อใหม่
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Send Test Email Modal */}
      {testModalOpen && (
        <div className="direct-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="test-email-title">
          <button
            type="button"
            className="email-modal-close-btn"
            aria-label="ปิดหน้าต่างส่งอีเมลทดสอบ"
            tabIndex={-1}
            onClick={() => setTestModalOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'default',
              zIndex: 0,
            }}
          />
          <div className="direct-modal-card compact" style={{ position: 'relative', zIndex: 1 }}>
            <div className="direct-modal-header">
              <div>
                <h3 id="test-email-title" className="direct-modal-title">
                  ส่งอีเมลทดสอบ: {currentScenarioDef.name}
                </h3>
                <p className="direct-modal-subtitle">
                  ส่งตัวอย่างอีเมล ({currentScenarioDef.shortLabel}) ด้วยเทมเพลตที่บันทึกไว้ไปยังกล่องจดหมายจริง
                </p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setTestModalOpen(false)}
                aria-label="ปิดหน้าต่าง"
              >
                <XIcon style={{ width: 18, height: 18 }} />
              </button>
            </div>
            <div className="direct-modal-body">
              <label style={{ fontSize: '0.85rem', color: '#0f172a', fontWeight: 500, display: 'block' }}>
                <span>ที่อยู่อีเมลผู้รับ:</span>
                <input
                  type="email"
                  value={testEmailRecipient}
                  onChange={(e) => setTestEmailRecipient(e.target.value)}
                  placeholder="ระบุอีเมลของคุณ (เว้นว่างเพื่อส่งหาตัวเอง)"
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    marginTop: '6px',
                    boxSizing: 'border-box',
                  }}
                />
              </label>

              {testResult && (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontSize: '0.82rem',
                    background: testResult.ok ? '#f0fdf4' : '#fef2f2',
                    color: testResult.ok ? '#166534' : '#991b1b',
                    border: `1px solid ${testResult.ok ? '#bbf7d0' : '#fecaca'}`,
                    marginTop: '10px',
                  }}
                >
                  {testResult.message}
                </div>
              )}
            </div>
            <div className="direct-modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setTestModalOpen(false)}
                style={{ height: '38px' }}
              >
                ปิด
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={handleSendTestEmail}
                disabled={isSendingTest}
                style={{ height: '38px', background: '#0f172a', color: '#ffffff' }}
              >
                {isSendingTest ? 'กำลังส่งอีเมล...' : 'ส่งอีเมลทดสอบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
