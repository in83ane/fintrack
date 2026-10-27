// App-side pause only. Database RPC permissions remain a separate purge task.
export const DATA_RESET_DISABLED_CODE = 'DATA_RESET_TEMPORARILY_DISABLED';

export const dataResetCopy = {
  th: {
    section: 'การล้างข้อมูล',
    title: 'ล้างข้อมูลทั้งหมด',
    unavailable: 'ปิดชั่วคราว',
    description: 'การล้างข้อมูลทั้งหมดปิดให้ใช้งานชั่วคราว ข้อมูลของคุณยังอยู่และจะไม่ถูกลบจากคำสั่งนี้',
  },
  en: {
    section: 'Data reset',
    title: 'Delete All Data',
    unavailable: 'Temporarily unavailable',
    description: 'Deleting all data is temporarily unavailable. Your data remains unchanged; this action will not delete it.',
  },
} as const;
