'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  BanknotesIcon,
  CalendarIcon,
  QrCodeIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  PrinterIcon,
  SearchIcon,
  XIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardCheckIcon,
} from '@/components/icons';

export type OwnerPolicyCategory = 'all' | 'governance' | 'reserve' | 'approval' | 'security' | 'legal';

export interface OwnerPolicyTermItem {
  number: string;
  title: string;
  content: string;
}

export interface OwnerPolicySection {
  id: string;
  category: 'governance' | 'reserve' | 'approval' | 'security' | 'legal';
  title: string;
  subtitle: string;
  badge: string;
  icon: 'governance' | 'reserve' | 'approval' | 'security' | 'legal';
  keyTakeaways: string[];
  terms: OwnerPolicyTermItem[];
}

const OWNER_POLICY_SECTIONS: OwnerPolicySection[] = [
  {
    id: 'governance',
    category: 'governance',
    title: 'การกำกับดูแลแพลตฟอร์มและโครงสร้างค่าบริการ',
    subtitle: 'หลักเกณฑ์การคิดค่าบริการระบบ อัตรามาตรฐาน การกำหนดเงื่อนไขเฉพาะราย และการหักรายได้ ณ ที่จ่าย',
    badge: 'ค่าบริการและกำกับดูแล',
    icon: 'governance',
    keyTakeaways: [
      'อัตราค่าบริการมาตรฐานกำหนดไว้ที่ 5% สำหรับราคาบัตรทั่วไป และ 3% สำหรับบัตรราคาพิเศษหรือรอบโปรโมชัน (AC-64, AC-77, G-42)',
      'เจ้าของระบบมีสิทธิ์พิจารณากำหนดอัตราค่าบริการเฉพาะรายผู้จัดงานหรือแต่ละคอนเสิร์ตผ่านระบบตั้งค่าหลังบ้าน (AC-23, AC-24)',
      'ระบบจะหักค่าบริการแพลตฟอร์มและค่าธรรมเนียมประมวลผลธุรกรรมโดยอัตโนมัติจากยอดจำหน่ายจริง ก่อนคำนวณยอดเงินสุทธินำส่ง (AC-25)',
    ],
    terms: [
      {
        number: '1.1',
        title: 'โครงสร้างและอัตราค่าบริการแพลตฟอร์ม (Platform Fee Schedule)',
        content:
          'แพลตฟอร์ม TICKET คิดค่าบริการระบบเป็นอัตราร้อยละจากมูลค่ารวมของบัตรคอนเสิร์ตที่จำหน่ายได้สำเร็จ โดยอัตรามาตรฐานคือ 5% ของมูลค่าหน้าบัตร และมีอัตราพิเศษ 3% สำหรับบัตรประเภทสิทธิพิเศษ โปรโมชัน หรือพันธมิตรที่ได้รับความเห็นชอบล่วงหน้า',
      },
      {
        number: '1.2',
        title: 'อำนาจการปรับแต่งค่าบริการรายคอนเสิร์ต (Custom Fee Discretion)',
        content:
          'เจ้าของระบบ (Owner) มีอำนาจแต่เพียงผู้เดียวในการกำหนดหรือแก้ไขรูปแบบค่าบริการ ไม่ว่าจะเป็นอัตราร้อยละ (Percentage), อัตราคงที่ต่อใบ (Per Ticket), หรือค่าธรรมเนียมเหมาจ่ายต่องาน (Flat Fee) ตามที่ตกลงในสัญญาร่วมจัดงานกับผู้จัดงานแต่ละราย',
      },
      {
        number: '1.3',
        title: 'เงื่อนไขการล็อกการแก้ไขค่าบริการ (Fee Immutability)',
        content:
          'เพื่อความถูกต้องทางบัญชีและความโปร่งใสต่อผู้ซื้อ เมื่อคอนเสิร์ตมีการจำหน่ายบัตรหรือมีการกันสิทธิ์บัตรในระบบแล้ว ระบบจะล็อกการตั้งค่าค่าบริการฝั่งผู้จัดงานโดยอัตโนมัติ ไม่สามารถแก้ไขย้อนหลังสำหรับรอบการขายที่เกิดขึ้นแล้วได้',
      },
      {
        number: '1.4',
        title: 'การจัดทำใบแจ้งสรุปรายได้และใบเสร็จค่าบริการ (Invoicing & Receipting)',
        content:
          'แพลตฟอร์มจะออกใบแจ้งสรุปยอดขาย หักค่าธรรมเนียมบริการ และเงินได้สุทธิประจำสัปดาห์ในระบบหลังบ้าน เพื่อให้ผู้จัดงานและเจ้าของระบบใช้เป็นเอกสารอ้างอิงทางภาษีและหลักฐานทางบัญชีตามมาตรฐานกฎหมายไทย',
      },
    ],
  },
  {
    id: 'reserve',
    category: 'reserve',
    title: 'กองทุนสำรองประกันความเสี่ยงและการจ่ายเงินสุทธิ',
    subtitle: 'มาตรการกักกันเงินสำรอง 10% เป็นเวลา 30 วัน รอบการโอนเงินสุทธิรายสัปดาห์ และการติดตามหนี้สินคงค้าง',
    badge: 'เงินสำรองและรอบจ่ายเงิน',
    icon: 'reserve',
    keyTakeaways: [
      'กักกันเงินสำรองประกันความเสี่ยง 10% ของยอดขายสุทธิ เป็นเวลา 30 วันนับจากวันจบรอบการแสดงเพื่อรองรับข้อพิพาท (AC-29, AC-78, AC-81, G-42)',
      'ตัดรอบยอดขายทุกวันอาทิตย์ เวลา 23:59:59 น. และเจ้าของระบบดำเนินการตรวจสอบพร้อมโอนเงินสุทธิทุกวันจันทร์ถัดไป (AC-78, AC-92)',
      'ระบบจะปลดล็อกและคืนเงินสำรองเข้าบัญชีผู้จัดงานโดยอัตโนมัติเมื่อครบกำหนด 30 วัน และไม่มีข้อพิพาทหรือยอดหนี้ค้าง (AC-83)',
    ],
    terms: [
      {
        number: '2.1',
        title: 'วัตถุประสงค์และสัดส่วนเงินสำรองประกันความเสี่ยง (10% 30-Day Reserve Fund)',
        content:
          'เพื่อคุ้มครองความปลอดภัยของผู้บริโภคและเสถียรภาพทางการเงินของแพลตฟอร์ม ระบบจะคำนวณหักเงินสำรองประกันความเสี่ยงในอัตราร้อยละ 10 จากรายได้สุทธิหลังหักค่าบริการ โดยยอดเงินสำรองนี้จะถูกกักไว้ในบัญชี Escrow ของแพลตฟอร์มเป็นระยะเวลา 30 วันนับแต่วันที่การแสดงรอบสุดท้ายสิ้นสุดลง',
      },
      {
        number: '2.2',
        title: 'รอบการตัดยอดและการโอนเงินสุทธิ (Weekly Settlement Cycle)',
        content:
          'ระบบจะสรุปยอดจำหน่ายบัตรประจำสัปดาห์ ณ วันอาทิตย์ เวลา 23:59:59 น. เจ้าของระบบจะตรวจสอบรายการและดำเนินการโอนเงินสุทธิ (Net Payable = ยอดขายรวม - ค่าบริการ - เงินสำรอง - หักลบหนี้คงค้าง) เข้าบัญชีธนาคารหลักของผู้จัดงานในวันจันทร์ถัดไป พร้อมแนบหลักฐานการโอนเงินในระบบ',
      },
      {
        number: '2.3',
        title: 'การปลดล็อกและการโอนคืนเงินสำรอง (Reserve Release Mandate)',
        content:
          'เมื่อครบกำหนดเวลา 30 วันหลังจบรอบการแสดง ระบบจะคำนวณยอดเงินสำรองคงเหลือสุทธิหลังหักภาระคืนเงินหรือค่าธรรมเนียมพิพาท และเปิดให้เจ้าของระบบดำเนินการโอนเงินสำรองคืนสู่บัญชีผู้จัดงาน พร้อมจัดเก็บหลักฐานการโอนเป็นประวัติธุรกรรมที่ตรวจสอบได้',
      },
      {
        number: '2.4',
        title: 'การบริหารจัดการยอดหนี้คงค้างและเงินเข้าล่าช้า (Negative Balance & Debt Settlement)',
        content:
          'กรณีเกิดเหตุการณ์คืนเงินเป็นจำนวนมากจนทำให้ยอดเงินสุทธิของผู้จัดงานติดลบ หรือมีรายการชำระเงินที่เข้าล่าช้าเกินกำหนดเวลา เจ้าของระบบมีสิทธิ์หักกลบลบหนี้จากยอดจำหน่ายของคอนเสิร์ตอื่นของผู้จัดงานรายเดียวกัน หรือออกหนังสือทวงถามให้ชำระหนี้ส่วนต่างภายใน 7 วันทำการ',
      },
    ],
  },
  {
    id: 'approval',
    category: 'approval',
    title: 'เกณฑ์การพิจารณาอนุมัติและการคืนเงิน',
    subtitle: 'ขั้นตอนการพิจารณาคำขอแก้ไขรอบการแสดง การยกเลิกคอนเสิร์ต และการอนุมัติการคืนเงินตามสิทธิผู้บริโภค',
    badge: 'อนุมัติและการคืนเงิน',
    icon: 'approval',
    keyTakeaways: [
      'การปรับเปลี่ยนราคาบัตร หรือเลื่อนวันเวลารอบการแสดง ต้องผ่านการประเมินผลกระทบและได้รับอนุมัติจากเจ้าของระบบ (AC-67, AC-68)',
      'กรณีเลื่อนรอบการแสดง ต้องกำหนดช่วงเวลาคุ้มครองให้ผู้ซื้อยื่นขอคืนเงินเต็มจำนวนเป็นเวลาอย่างน้อย 14 วัน (AC-38, AC-108)',
      'กรณียกเลิกงาน ต้องคืนเงินให้แก่ผู้ซื้อ 100% เต็มจำนวนทุกกรณี พร้อมเพิกถอนสิทธิ์บัตรและบันทึกหนี้สินผู้จัดงาน (AC-35, AC-36, AC-37)',
    ],
    terms: [
      {
        number: '3.1',
        title: 'เกณฑ์การอนุมัติคำขอแก้ไขรอบการแสดง (Live Session Amendment Criteria)',
        content:
          'เจ้าของระบบจะพิจารณาคำขอแก้ไขประเภทบัตร โควตา หรือเวลาการแสดงที่เปิดขายอยู่ โดยคำนึงถึง: 1) สิทธิประโยชน์ของผู้ถือบัตรที่ซื้อไปแล้วต้องไม่ด้อยลง 2) โควตาใหม่ต้องไม่ต่ำกว่าจำนวนบัตรที่ขายหรือกันสิทธิ์ไปแล้ว 3) เหตุผลความจำเป็นในการปรับเปลี่ยนที่ผู้จัดงานชี้แจง',
      },
      {
        number: '3.2',
        title: 'มาตรการคุ้มครองผู้ซื้อกรณีเลื่อนวันเวลาการแสดง (Reschedule Protection Window)',
        content:
          'เมื่อมีการอนุมัติเลื่อนวันหรือเวลาจัดคอนเสิร์ต ระบบจะบังคับให้เปิดช่วงเวลาขอคืนเงินพิเศษ (Special Refund Window) อย่างน้อย 14 วัน เพื่อให้ผู้ซื้อที่ไม่สะดวกเข้าร่วมในวันใหม่สามารถยื่นขอคืนเงินได้เต็มจำนวนโดยไม่มีค่าธรรมเนียมใด ๆ ทั้งสิ้น',
      },
      {
        number: '3.3',
        title: 'การอนุมัติการยกเลิกคอนเสิร์ต (Event Cancellation Protocol)',
        content:
          'กรณีผู้จัดงานขอยกเลิกคอนเสิร์ต เจ้าของระบบจะตรวจสอบสาเหตุและอนุมัติการยกเลิก ซึ่งจะส่งผลให้: 1) ระบบปิดการจำหน่ายบัตรทันที 2) เพิกถอนสิทธิ์ QR Code ของบัตรทุกใบ 3) บันทึกยอดภาระหนี้สินเพื่อดำเนินการโอนเงินคืนสู่บัญชีผู้ซื้อครบ 100% เต็มจำนวน',
      },
      {
        number: '3.4',
        title: 'กระบวนการโอนเงินคืนและการจัดเก็บหลักฐานแบบส่วนตัว (Manual Refund & Private Proof Storage)',
        content:
          'การโอนเงินคืนแก่ผู้ซื้อดำเนินการผ่านบัญชีธนาคารหรือพร้อมเพย์ โดยเจ้าของระบบมีหน้าที่แนบสลิปหรือหลักฐานการโอนเงินในระบบ ซึ่งไฟล์หลักฐานนี้จะถูกจัดเก็บใน Private Storage ที่เข้าถึงได้เฉพาะเจ้าหน้าที่ผู้ดูแลระบบเพื่อความปลอดภัยของข้อมูลธุรกรรม (AC-92)',
      },
    ],
  },
  {
    id: 'security',
    category: 'security',
    title: 'การกำกับดูแลระบบสแกนเนอร์และความปลอดภัยหน้างาน',
    subtitle: 'กติกาการผูก 1 อุปกรณ์ต่อ 1 สิทธิ์ การจำกัดเครื่องหลักโหมดออฟไลน์ และการตรวจสอบข้อขัดแย้งการเข้างาน',
    badge: 'สแกนเนอร์และความปลอดภัย',
    icon: 'security',
    keyTakeaways: [
      'ลิงก์และ QR Code สำหรับเข้าหน้าสแกน 1 สิทธิ์ สามารถผูกใช้งานได้เพียง 1 อุปกรณ์เท่านั้น เพื่อป้องกันการสวมสิทธิ์ (D-104)',
      'อนุญาตให้ใช้งานโหมดออฟไลน์ได้เฉพาะเครื่องหลักของผู้จัดงาน 1 เครื่องต่อคอนเสิร์ตเท่านั้น เพื่อป้องกันการสแกนซ้ำข้ามประตู (G-41)',
      'บันทึกประวัติการสแกนเข้า-ออก (Re-entry) อย่างเคร่งครัด พร้อมระบบตรวจจับและแจ้งเตือนข้อขัดแย้งการซิงก์ออฟไลน์ (G-07, AC-97)',
    ],
    terms: [
      {
        number: '4.1',
        title: 'การผูกอุปกรณ์เจ้าหน้าที่สแกนเนอร์ (Single-Device Access Binding)',
        content:
          'สิทธิ์การเข้าใช้งานหน้าสแกนเนอร์จะถูกผูกเข้ากับ Device ID ของอุปกรณ์แรกที่เปิดใช้งานทันที หากมีอุปกรณ์อื่นพยายามเข้าถึงด้วยลิงก์เดียวกัน ระบบจะปฏิเสธการเข้าใช้งาน เจ้าของระบบหรือผู้จัดงานสามารถสั่งรีเซ็ตอุปกรณ์จากหลังบ้านได้เมื่อมีเหตุจำเป็นทางเทคนิคหน้างาน',
      },
      {
        number: '4.2',
        title: 'ข้อจำกัดสิทธิ์โหมดออฟไลน์ (Primary Scanner Offline Authority)',
        content:
          'เพื่อป้องกันความเสี่ยงจากการนำบัตรใบเดียวกันไปสแกนพร้อมกันที่ประตูทางเข้าหลายจุดในสภาวะไม่มีอินเทอร์เน็ต ระบบกำหนดให้มีสิทธิ์ดาวน์โหลดชุดข้อมูลและเปิดใช้งานโหมดออฟไลน์ได้เฉพาะ "เครื่องหลักของผู้จัดงาน" (Primary Scanner) เพียง 1 เครื่องต่อคอนเสิร์ตเท่านั้น',
      },
      {
        number: '4.3',
        title: 'การซิงก์ข้อมูลและการจัดการข้อขัดแย้ง (Sync Conflict Resolution)',
        content:
          'เมื่อเครื่องสแกนออฟไลน์กลับมาเชื่อมต่อเครือข่ายอินเทอร์เน็ต ข้อมูลการตรวจบัตรจะถูกซิงก์เข้าสู่ฐานข้อมูลกลาง หากตรวจพบข้อขัดแย้ง เช่น มีการสแกนซ้ำจากเครื่องอื่น ระบบจะบันทึกเข้าสู่หน้า "ข้อขัดแย้งออฟไลน์" ในหลังบ้านเจ้าของระบบเพื่อตรวจสอบและยืนยันผลการตัดสินทันที',
      },
      {
        number: '4.4',
        title: 'มาตรการตรวจเข้า-ออกงาน (Re-entry Admission Enforcement)',
        content:
          'ระบบรองรับนโยบายเข้า-ออกงานตามมาตรฐาน โดยผู้ชมที่เข้างานแล้วจะต้องได้รับการสแกนบันทึกสถานะ "ออกงานแล้ว" ก่อนเท่านั้น จึงจะสามารถสแกนกลับเข้างานใหม่ได้ หากไม่มีประวัติการบันทึกออก ระบบจะปฏิเสธการเข้างานทันทีเพื่อป้องกันการส่งต่อบัตรให้บุคคลภายนอก',
      },
    ],
  },
  {
    id: 'legal',
    category: 'legal',
    title: 'ความรับผิดชอบทางกฎหมาย การคุ้มครองข้อมูล และการระงับสิทธิ์',
    subtitle: 'การปฏิบัติตาม พ.ร.บ. คุ้มครองข้อมูลส่วนบุคคล (PDPA) มาตรการตรวจสอบย้อนหลัง และอำนาจระงับบัญชีผู้ฝ่าฝืน',
    badge: 'กฎหมายและ PDPA',
    icon: 'legal',
    keyTakeaways: [
      'ข้อมูลส่วนบุคคลของผู้ซื้อและผู้จัดงานได้รับการคุ้มครองตามมาตรฐาน พ.ร.บ. PDPA และนโยบายความเป็นส่วนตัวอย่างเคร่งครัด',
      'ทุกการแก้ไขข้อมูลติดต่อผู้ซื้อและการโอนเงินจะถูกบันทึกเป็น Audit Trail อย่างละเอียดเพื่อตรวจสอบย้อนหลังได้ 100%',
      'เจ้าของระบบมีอำนาจระงับบัญชี อายัดรายได้ และดำเนินคดีตามกฎหมายทันทีหากตรวจพบพฤติกรรมฉ้อโกงหรือทุจริต',
    ],
    terms: [
      {
        number: '5.1',
        title: 'การคุ้มครองข้อมูลส่วนบุคคล (Personal Data Protection Act Compliance)',
        content:
          'แพลตฟอร์ม TICKET จัดเก็บและประมวลผลข้อมูลส่วนบุคคลของผู้ซื้อ (ชื่อ นามสกุล อีเมล เบอร์โทรศัพท์ ประวัติการทำธุรกรรม) เพื่อวัตถุประสงค์ในการออกบัตร การตรวจเข้างาน และการแจ้งข้อมูลข่าวสารที่เกี่ยวข้องกับการแสดงเท่านั้น โดยจะไม่เปิดเผยหรือนำไปแสวงหาผลประโยชน์อื่นใดโดยมิชอบ',
      },
      {
        number: '5.2',
        title: 'การตรวจสอบและบันทึกประวัติการแก้ไขข้อมูล (Audit Logging & Data Integrity)',
        content:
          'การแก้ไขข้อมูลติดต่อของคำสั่งซื้อที่ชำระเงินแล้วสามารถกระทำได้เฉพาะโดยเจ้าของระบบที่ตรวจสอบยืนยันตัวตนผู้ร้องขอแล้วเท่านั้น โดยระบบจะจัดเก็บประวัติการแก้ไข หมายเลขอ้างอิง เวลา และข้อมูลเดิมไว้อย่างครบถ้วนเพื่อใช้เป็นหลักฐานยืนยันความถูกต้อง',
      },
      {
        number: '5.3',
        title: 'อำนาจการระงับการให้บริการและอายัดเงิน (Account Suspension & Sanction Authority)',
        content:
          'หากตรวจพบว่าผู้จัดงานหรือผู้ใช้งานมีพฤติกรรมเข้าข่ายทุจริต ปลอมแปลงเอกสาร จำหน่ายบัตรเกินโควตา หรือกระทำการใด ๆ ที่ละเมิดกฎหมาย เจ้าของระบบมีสิทธิ์ระงับการเข้าถึงระบบชั่วคราวหรือถาวร อายัดยอดเงินในระบบ และส่งเรื่องดำเนินคดีตามกฎหมายต่อหน่วยงานที่เกี่ยวข้องทันที',
      },
      {
        number: '5.4',
        title: 'ขอบเขตความรับผิดชอบและการชดใช้ความเสียหาย (Limitation of Liability & Indemnification)',
        content:
          'แพลตฟอร์ม TICKET เป็นผู้ให้บริการระบบจำหน่ายบัตรและโครงสร้างพื้นฐานด้านเทคโนโลยีเท่านั้น ผู้จัดงานเป็นผู้รับผิดชอบโดยตรงต่อเนื้อหา คุณภาพ ความปลอดภัย และการจัดแสดงคอนเสิร์ต หากเกิดความเสียหายใด ๆ จากการแสดง ผู้จัดงานตกลงที่จะรับผิดชอบและชดใช้ค่าเสียหายที่เกิดขึ้นทั้งหมด',
      },
    ],
  },
];

export function OwnerPoliciesView() {
  const [selectedCategory, setSelectedCategory] = useState<OwnerPolicyCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setShowScrollTop(window.scrollY > 300);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleExpandAll = () => {
    const all: Record<string, boolean> = {};
    for (const s of OWNER_POLICY_SECTIONS) {
      all[s.id] = true;
    }
    setExpandedSections(all);
  };

  const handleCollapseAll = () => {
    setExpandedSections({});
  };

  const filteredSections = useMemo(() => {
    return OWNER_POLICY_SECTIONS.filter((section) => {
      // 1. Filter by category
      if (selectedCategory !== 'all' && section.category !== selectedCategory) {
        return false;
      }

      // 2. Filter by search query
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const inTitle = section.title.toLowerCase().includes(q);
      const inSubtitle = section.subtitle.toLowerCase().includes(q);
      const inTakeaways = section.keyTakeaways.some((t) => t.toLowerCase().includes(q));
      const inTerms = section.terms.some(
        (term) =>
          term.title.toLowerCase().includes(q) ||
          term.content.toLowerCase().includes(q) ||
          term.number.toLowerCase().includes(q),
      );

      return inTitle || inSubtitle || inTakeaways || inTerms;
    });
  }, [selectedCategory, searchQuery]);

  const categoryCounts = useMemo(() => {
    const counts: Record<OwnerPolicyCategory, number> = {
      all: OWNER_POLICY_SECTIONS.length,
      governance: 0,
      reserve: 0,
      approval: 0,
      security: 0,
      legal: 0,
    };
    for (const s of OWNER_POLICY_SECTIONS) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    return counts;
  }, []);

  const isAllExpanded = useMemo(() => {
    if (filteredSections.length === 0) return false;
    return filteredSections.every((s) => expandedSections[s.id]);
  }, [filteredSections, expandedSections]);

  const renderSectionIcon = (icon: OwnerPolicySection['icon']) => {
    switch (icon) {
      case 'governance':
        return <BanknotesIcon width={24} height={24} />;
      case 'reserve':
        return <CalendarIcon width={24} height={24} />;
      case 'approval':
        return <ClipboardCheckIcon width={24} height={24} />;
      case 'security':
        return <QrCodeIcon width={24} height={24} />;
      case 'legal':
        return <ShieldCheckIcon width={24} height={24} />;
      default:
        return <ShieldCheckIcon width={24} height={24} />;
    }
  };

  return (
    <div className="policies-management-container" data-testid="owner-policies-view">
      {/* 1. Header Toolbar */}
      <header className="policies-management-header">
        <div className="policies-management-title-wrap">
          <h1 className="policies-management-title">นโยบายและกฎบัตรการกำกับดูแลแพลตฟอร์ม</h1>
          <p className="policies-management-desc">
            ข้อกำหนด กฎบัตรการกำกับดูแล มาตรการความปลอดภัยทางการเงิน และนโยบายการให้บริการของแพลตฟอร์ม TICKET
          </p>
        </div>
        <button
          type="button"
          className="policies-print-btn"
          onClick={() => window.print()}
          data-testid="owner-policies-print-btn"
          title="พิมพ์หรือบันทึกเป็นเอกสาร PDF"
          aria-label="พิมพ์หรือบันทึกเป็นเอกสาร PDF"
        >
          <PrinterIcon width={16} height={16} />
          <span>พิมพ์ / บันทึก PDF ข้อตกลง</span>
        </button>
      </header>

      {/* 2. Category Tabs & Search Bar */}
      <div className="policies-filter-bar">
        <nav className="policies-category-tabs" aria-label="ตัวกรองหมวดหมู่นโยบาย">
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'all' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('all')}
            data-testid="owner-policy-tab-all"
          >
            <span>ทั้งหมด</span>
            <span className="policies-tab-count">{categoryCounts.all}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'governance' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('governance')}
            data-testid="owner-policy-tab-governance"
          >
            <span>การกำกับดูแลและค่าบริการ</span>
            <span className="policies-tab-count">{categoryCounts.governance}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'reserve' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('reserve')}
            data-testid="owner-policy-tab-reserve"
          >
            <span>กองทุนสำรองและรอบโอนเงิน</span>
            <span className="policies-tab-count">{categoryCounts.reserve}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'approval' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('approval')}
            data-testid="owner-policy-tab-approval"
          >
            <span>เกณฑ์อนุมัติและมาตรการคืนเงิน</span>
            <span className="policies-tab-count">{categoryCounts.approval}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'security' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('security')}
            data-testid="owner-policy-tab-security"
          >
            <span>สแกนเนอร์และความปลอดภัย</span>
            <span className="policies-tab-count">{categoryCounts.security}</span>
          </button>
          <button
            type="button"
            className={`policies-category-tab ${selectedCategory === 'legal' ? 'is-active' : ''}`}
            onClick={() => setSelectedCategory('legal')}
            data-testid="owner-policy-tab-legal"
          >
            <span>กฎหมายและการระงับสิทธิ์</span>
            <span className="policies-tab-count">{categoryCounts.legal}</span>
          </button>
        </nav>

        <div className="policies-search-wrap">
          <SearchIcon width={16} height={16} className="policies-search-icon" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหานโยบายการกำกับดูแล..."
            className="policies-search-input"
            data-testid="owner-policies-search-input"
            aria-label="ค้นหานโยบายการกำกับดูแล"
          />
          {searchQuery && (
            <button
              type="button"
              className="policies-search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="ล้างคำค้นหา"
            >
              <XIcon width={14} height={14} />
            </button>
          )}
        </div>
      </div>

      {/* 3. Toolbar: Count & Expand/Collapse Toggle */}
      <div className="policies-toolbar-actions">
        <span className="policies-count-label">
          แสดง <strong>{filteredSections.length}</strong> จากทั้งหมด {OWNER_POLICY_SECTIONS.length} หมวดหมู่นโยบาย
        </span>
        <div className="policies-expand-controls">
          {isAllExpanded ? (
            <button
              type="button"
              className="policies-toggle-all-btn"
              onClick={handleCollapseAll}
              data-testid="owner-policies-collapse-all-btn"
            >
              <ChevronUpIcon width={14} height={14} />
              <span>พับข้อกำหนดทั้งหมด</span>
            </button>
          ) : (
            <button
              type="button"
              className="policies-toggle-all-btn"
              onClick={handleExpandAll}
              data-testid="owner-policies-expand-all-btn"
            >
              <ChevronDownIcon width={14} height={14} />
              <span>ขยายข้อกำหนดทั้งหมด</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Policy Cards List */}
      <div className="policies-sections-list">
        {filteredSections.length === 0 ? (
          <div className="policies-empty-state">
            <ShieldCheckIcon width={48} height={48} className="policies-empty-icon" />
            <h3 className="policies-empty-title">ไม่พบนโยบายที่ตรงกับคำค้นหา</h3>
            <p className="policies-empty-desc">
              ลองค้นหาด้วยคำอื่น เช่น &ldquo;ค่าบริการ&rdquo;, &ldquo;เงินสำรอง&rdquo;, &ldquo;สแกนเนอร์&rdquo; หรือ &ldquo;คืนเงิน&rdquo;
            </p>
            <button
              type="button"
              className="policies-empty-reset-btn"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
            >
              ล้างตัวกรองและคำค้นหา
            </button>
          </div>
        ) : (
          filteredSections.map((section) => {
            const isExpanded = !!expandedSections[section.id];
            return (
              <article
                key={section.id}
                id={`policy-section-${section.id}`}
                className={`policy-editorial-card ${isExpanded ? 'is-terms-open' : ''}`}
                data-testid={`owner-policy-card-${section.id}`}
              >
                {/* Header of each Card */}
                <header className="policy-card-header">
                  <div className="policy-card-icon-box">{renderSectionIcon(section.icon)}</div>
                  <div className="policy-card-heading-wrap">
                    <div className="policy-card-eyebrow">
                      <span className="policy-card-badge">{section.badge}</span>
                    </div>
                    <h2 className="policy-card-title">{section.title}</h2>
                    <p className="policy-card-subtitle">{section.subtitle}</p>
                  </div>
                </header>

                {/* Key Takeaways Box (Always visible in collapsed state) */}
                <div className="policy-takeaways-box">
                  <div className="policy-takeaways-header">
                    <span className="policy-takeaways-title">สรุปสาระสำคัญสำหรับผู้ดูแลระบบ (Key Governance Mandates)</span>
                  </div>
                  <ul className="policy-takeaways-list">
                    {section.keyTakeaways.map((takeaway) => (
                      <li key={takeaway} className="policy-takeaway-item">
                        <CheckCircleIcon width={16} height={16} className="policy-takeaway-icon" />
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Collapsible Full Terms & Conditions */}
                <div className="policy-terms-collapsible">
                  {isExpanded && (
                    <div className="policy-terms-body" data-testid={`owner-policy-terms-${section.id}`}>
                      <h3 className="policy-terms-heading">ข้อกำหนดและกฎบัตรฉบับเต็ม (Full Governance Charter)</h3>
                      <div className="policy-terms-list">
                        {section.terms.map((term) => (
                          <div key={term.number} className="policy-term-item">
                            <h4 className="policy-term-title">
                              <span className="policy-term-number">{term.number}</span>
                              <span>{term.title}</span>
                            </h4>
                            <p className="policy-term-content">{term.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Print-only Full Terms view (always rendered for print media) */}
                  <div className="policy-terms-print-only">
                    <h3 className="policy-terms-heading">ข้อกำหนดและกฎบัตรฉบับเต็ม (Full Governance Charter)</h3>
                    <div className="policy-terms-list">
                      {section.terms.map((term) => (
                        <div key={term.number} className="policy-term-item">
                          <h4 className="policy-term-title">
                            <span className="policy-term-number">{term.number}</span>
                            <span>{term.title}</span>
                          </h4>
                          <p className="policy-term-content">{term.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Footer: Expand/Collapse Button */}
                <footer className="policy-card-footer">
                  <button
                    type="button"
                    className="policy-toggle-card-btn"
                    onClick={() => toggleSection(section.id)}
                    aria-expanded={isExpanded}
                    data-testid={`owner-policy-toggle-btn-${section.id}`}
                  >
                    <span>{isExpanded ? 'พับเก็บข้อกำหนดฉบับเต็ม' : 'ดูข้อกำหนดและกฎบัตรฉบับเต็ม'}</span>
                    {isExpanded ? (
                      <ChevronUpIcon width={16} height={16} />
                    ) : (
                      <ChevronDownIcon width={16} height={16} />
                    )}
                  </button>
                </footer>
              </article>
            );
          })
        )}
      </div>

      {/* Floating Scroll-to-Top Button */}
      {showScrollTop && (
        <button
          type="button"
          className="policies-scroll-top-btn"
          onClick={handleScrollToTop}
          title="กลับขึ้นด้านบน"
          aria-label="กลับขึ้นด้านบน"
        >
          <ChevronUpIcon width={18} height={18} />
        </button>
      )}
    </div>
  );
}
