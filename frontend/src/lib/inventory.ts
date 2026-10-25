export function getQuantityError(value: string, available: number): string | null {
  const quantity = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(quantity) || quantity < 1) {
    return "Số lượng phải là số nguyên lớn hơn 0.";
  }
  if (quantity > available) {
    return `Số lượng vượt tồn kho. Chỉ có thể chọn tối đa ${available} món.`;
  }
  return null;
}
