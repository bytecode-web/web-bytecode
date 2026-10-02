import { create } from 'zustand';

export type PricingModel = 'fixed' | 'range' | 'per_unit' | 'monthly_recurring' | 'yearly_recurring';
export type PricingItemType = 'base_canvas' | 'base_included' | 'category_trigger' | 'addon' | 'recurring';

export type PricingCatalogItem = {
  id: string;
  item_code?: string;
  name: string;
  description?: string | null;
  pricing_model: PricingModel;
  base_price: number | string;
  max_price?: number | string | null;
  free_included_quantity?: number | string | null;
  included_features?: string[] | string | null;
  currency_code?: string;
  item_type?: PricingItemType | null;
  upgrades_to_category?: string | null;
  is_draggable?: boolean | null;
  icon_name?: string | null;
};

export type NormalizedPricingCatalogItem = PricingCatalogItem & {
  item_type: PricingItemType;
  is_draggable: boolean;
};

export type QuoteCartLine = {
  catalogItemId: string;
  itemCode?: string;
  quantity: number;
  customPrice?: number;
};

export type QuotePreparedItem = {
  catalog_item_id: string;
  name: string;
  item_type: PricingItemType;
  pricing_model: PricingModel;
  quantity: number;
  billable_quantity: number;
  free_included_quantity: number;
  unit_price: number;
  discount_amount: number;
  subtotal: number;
  recurrence: 'none' | 'monthly' | 'yearly';
};

export type PreparedQuotePayload = {
  editingQuoteId: string | null;
  title: string;
  projectCategory: string;
  baseCatalogItemId: string;
  developmentTotal: number;
  recurringMonthlyTotal: number;
  recurringYearlyTotal: number;
  grandTotalSnapshot: number;
  infrastructure: InfrastructureState & {
    savingsLabel: string;
    netSavings: number;
  };
  items: QuotePreparedItem[];
  cartItems: QuotePreparedItem[];
  legalNotes: string[];
};

export type InfrastructureState = {
  ownDomain: boolean;
  ownHosting: boolean;
};

export type EditableQuoteData = {
  id: string;
};

export type EditableQuoteItemData = {
  catalog_item_id?: string;
  pricing_catalog_id?: string;
  item_code?: string;
  quantity?: number | string | null;
  unit_price?: number | string | null;
};

type QuoteTotals = {
  title: string;
  projectCategory: string;
  baseItem: NormalizedPricingCatalogItem | null;
  activeBaseSource: NormalizedPricingCatalogItem | null;
  visibleLines: Array<QuoteCartLine & {
    item: NormalizedPricingCatalogItem;
    subtotal: number;
    billableQuantity: number;
    freeIncludedQuantity: number;
    unitPrice: number;
    includedInBase: boolean;
    isActiveBaseTrigger: boolean;
  }>;
  persistedItems: QuotePreparedItem[];
  cartItems: QuotePreparedItem[];
  developmentTotal: number;
  recurringMonthlyTotal: number;
  recurringYearlyTotal: number;
  infrastructureSavings: {
    label: string;
    netSavings: number;
  };
};

export type QuoterAlert = { message: string, title?: string, type?: 'warning' | 'info' | 'error' };

type QuoterState = {
  alertModal: QuoterAlert | null;
  setAlertModal: (alert: QuoterAlert | null) => void;
  catalog: NormalizedPricingCatalogItem[];
  cart: QuoteCartLine[];
  infrastructure: InfrastructureState;
  editingQuoteId: string | null;
  setCatalog: (catalog: PricingCatalogItem[]) => void;
  loadQuoteForEditing: (quoteData: EditableQuoteData, itemsData: EditableQuoteItemData[]) => void;
  resetQuoter: () => void;
  addItem: (catalogItemId: string) => void;
  removeItem: (catalogItemId: string) => void;
  updateQuantity: (catalogItemId: string, quantity: number) => void;
  setCustomPrice: (itemCode: string, price: number) => void;
  validateAndClampCustomPrice: (itemCode: string) => void;
  toggleOwnDomain: (enabled: boolean) => void;
  toggleOwnHosting: (enabled: boolean) => void;
  resetQuote: () => void;
  totals: () => QuoteTotals;
  buildPayload: () => PreparedQuotePayload;
};

const DEFAULT_PROJECT_CATEGORY = 'Landing Page';
const LEGAL_NOTES = [
  'Nota Legal: Retrasos mayores a 60 dias tendran un recargo del 20%. Cancelaciones requieren un abono del 20% por tiempo invertido.',
];
const DOMAIN_INFRA_CODES = ['discount_own_domain', 'fee_domain_setup'];
const HOSTING_INFRA_CODES = ['discount_own_hosting', 'fee_hosting_setup'];
const INFRA_CODES = new Set([...DOMAIN_INFRA_CODES, ...HOSTING_INFRA_CODES]);
const MAINTENANCE_LEVELS: Record<string, { level: number; label: string }> = {
  seo_maintenance_basic: { level: 1, label: 'Mantenimiento Basico' },
  maintenance_mid: { level: 2, label: 'Mantenimiento Intermedio' },
  maintenance_pro: { level: 3, label: 'Mantenimiento Avanzado' },
};
const REVISION_LEVELS: Record<string, { level: number }> = {
  revision_basic: { level: 1 },
  revision_mid: { level: 2 },
  revision_custom: { level: 3 },
};

const moneyValue = (value: number | string | null | undefined) => Number(value ?? 0);
const formatPenValue = (value: number) => `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const normalizeIncludedFeatures = (value: PricingCatalogItem['included_features']) => {
  if (Array.isArray(value)) return value.filter((feature): feature is string => typeof feature === 'string' && feature.trim().length > 0);
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((feature): feature is string => typeof feature === 'string' && feature.trim().length > 0);
    }
  } catch {
    return [];
  }

  return [];
};

const triggerCategoryByCode: Record<string, string> = {
  ecommerce: 'Tienda Online (E-commerce)',
  web_corporate: 'Web Corporativa',
  chatbot_basic: 'Automatizacion con Chatbot',
};

const inferItemType = (item: PricingCatalogItem): PricingItemType => {
  if (item.item_type) return item.item_type;
  if (item.item_code === 'landing_page') return 'base_canvas';
  if (item.item_code && Object.hasOwn(triggerCategoryByCode, item.item_code)) return 'category_trigger';
  if (item.pricing_model === 'monthly_recurring' || item.pricing_model === 'yearly_recurring') return 'recurring';
  return 'addon';
};

export const normalizePricingCatalog = (catalog: PricingCatalogItem[]): NormalizedPricingCatalogItem[] =>
  catalog.map((item) => {
    const itemType = inferItemType(item);
    return {
      ...item,
      item_type: itemType,
      upgrades_to_category: item.upgrades_to_category ?? (item.item_code ? triggerCategoryByCode[item.item_code] : null),
      is_draggable: item.is_draggable ?? !['base_canvas', 'base_included'].includes(itemType),
      free_included_quantity: item.free_included_quantity ?? 0,
      included_features: normalizeIncludedFeatures(item.included_features),
    };
  });

const isRecurring = (item: NormalizedPricingCatalogItem) =>
  item.item_type === 'recurring' ||
  item.pricing_model === 'monthly_recurring' ||
  item.pricing_model === 'yearly_recurring';

const recurrenceFor = (item: NormalizedPricingCatalogItem): 'none' | 'monthly' | 'yearly' => {
  if (item.pricing_model === 'monthly_recurring') return 'monthly';
  if (item.pricing_model === 'yearly_recurring') return 'yearly';
  return item.item_type === 'recurring' ? 'monthly' : 'none';
};

const maintenanceLevelFor = (item: NormalizedPricingCatalogItem) =>
  item.item_code ? MAINTENANCE_LEVELS[item.item_code] ?? null : null;

const revisionLevelFor = (item: NormalizedPricingCatalogItem) =>
  item.item_code ? REVISION_LEVELS[item.item_code] ?? null : null;

export const requiresCustomPrice = (item: NormalizedPricingCatalogItem) =>
  item.item_code === 'revision_custom' || (item.item_type === 'addon' && item.pricing_model === 'range');

export const allowsMultipleQuantity = (item: NormalizedPricingCatalogItem) =>
  item.pricing_model === 'per_unit' || Boolean(revisionLevelFor(item));

const showMaintenanceDowngradeWarning = (includedBy: string) => {
  if (typeof window !== 'undefined') {
    setTimeout(() => useQuoterState.getState().setAlertModal({ title: 'Aviso de Mantenimiento', message: `El ${includedBy} ya incluye las caracteristicas de este plan.`, type: 'warning' }), 0);
  }
};

const showRevisionDowngradeWarning = () => {
  if (typeof window !== 'undefined') {
    setTimeout(() => useQuoterState.getState().setAlertModal({ title: 'Aviso de Revisión', message: 'El nivel actual de revisión ya cubre los cambios básicos. No es necesario agregarlo.', type: 'info' }), 0);
  }
};

const showCustomPriceClampWarning = (basePrice: number, maxPrice: number | null) => {
  if (typeof window !== 'undefined') {
    const maxLabel = maxPrice === null ? 'sin limite superior' : formatPenValue(maxPrice);
    setTimeout(() => useQuoterState.getState().setAlertModal({ title: 'Precio Ajustado', message: `El precio fue ajustado. El rango permitido para este elemento es entre ${formatPenValue(basePrice)} y ${maxLabel}.`, type: 'warning' }), 0);
  }
};

const lineQuantity = (item: NormalizedPricingCatalogItem, quantity: number) =>
  allowsMultipleQuantity(item) ? Math.max(1, quantity) : 1;

const clampCustomPriceFor = (item: NormalizedPricingCatalogItem, price: number | undefined) => {
  const basePrice = moneyValue(item.base_price);
  const rawMaxPrice = item.max_price === null || item.max_price === undefined ? null : moneyValue(item.max_price);
  const maxPrice = rawMaxPrice && rawMaxPrice > 0 ? rawMaxPrice : null;
  const currentPrice = typeof price === 'number' && Number.isFinite(price) ? price : basePrice;
  const clampedPrice = Math.min(Math.max(currentPrice, basePrice), maxPrice ?? Number.POSITIVE_INFINITY);

  return {
    basePrice,
    maxPrice,
    clampedPrice,
    wasClamped: price !== clampedPrice,
  };
};

const freeQuantityFor = (item: NormalizedPricingCatalogItem) =>
  item.pricing_model === 'per_unit' ? Math.max(0, Math.floor(moneyValue(item.free_included_quantity))) : 0;

const billableQuantityFor = (item: NormalizedPricingCatalogItem, quantity: number) => {
  const normalizedQuantity = lineQuantity(item, quantity);
  if (item.pricing_model !== 'per_unit') return normalizedQuantity;
  return Math.max(0, normalizedQuantity - freeQuantityFor(item));
};

const preparedItem = (
  item: NormalizedPricingCatalogItem,
  quantity: number,
  unitPrice = moneyValue(item.base_price),
  subtotal?: number,
  discountAmount = 0,
): QuotePreparedItem => {
  const normalizedQuantity = lineQuantity(item, quantity);
  const billableQuantity = billableQuantityFor(item, normalizedQuantity);
  const freeIncludedQuantity = freeQuantityFor(item);
  const isDiscountItem = unitPrice < 0 || (item.item_code ? item.item_code.startsWith('discount_') : false);
  const effectiveDiscount = isDiscountItem && unitPrice < 0 ? Math.abs(unitPrice) : discountAmount;
  const effectiveUnitPrice = isDiscountItem && unitPrice < 0 ? 0 : Math.abs(unitPrice);
  return {
    catalog_item_id: item.id,
    name: item.name,
    item_type: item.item_type,
    pricing_model: item.pricing_model,
    quantity: normalizedQuantity,
    billable_quantity: billableQuantity,
    free_included_quantity: freeIncludedQuantity,
    unit_price: effectiveUnitPrice,
    discount_amount: effectiveDiscount,
    subtotal: subtotal ?? (effectiveUnitPrice * billableQuantity) - effectiveDiscount,
    recurrence: recurrenceFor(item),
  };
};

const defaultCartFor = (catalog: NormalizedPricingCatalogItem[]): QuoteCartLine[] => {
  return catalog
    .filter((item) =>
      item.item_type === 'base_canvas' ||
      item.item_type === 'base_included',
    )
    .sort((a, b) => {
      const orderFor = (item: NormalizedPricingCatalogItem) => {
        if (item.item_type === 'base_canvas') return 0;
        if (item.item_type === 'base_included') return 1;
        return 2;
      };
      return orderFor(a) - orderFor(b) || a.name.localeCompare(b.name);
    })
    .map((item) => ({ catalogItemId: item.id, itemCode: item.item_code, quantity: 1 }));
};

const defaultInfrastructure = (): InfrastructureState => ({
  ownDomain: false,
  ownHosting: false,
});

const cartLineFor = (item: NormalizedPricingCatalogItem): QuoteCartLine => ({
  catalogItemId: item.id,
  itemCode: item.item_code,
  quantity: 1,
  ...(requiresCustomPrice(item) ? { customPrice: moneyValue(item.base_price) } : {}),
});

const cartLineFromEditableItem = (
  catalog: NormalizedPricingCatalogItem[],
  source: EditableQuoteItemData,
): QuoteCartLine | null => {
  const item = catalog.find((entry) =>
    (source.item_code && entry.item_code === source.item_code) ||
    entry.id === source.catalog_item_id ||
    entry.id === source.pricing_catalog_id,
  );
  if (!item) return null;

  const quantity = Math.max(1, Math.floor(moneyValue(source.quantity) || 1));
  const unitPrice = source.unit_price === null || source.unit_price === undefined ? undefined : moneyValue(source.unit_price);
  const basePrice = moneyValue(item.base_price);
  const customPrice = unitPrice !== undefined && (requiresCustomPrice(item) || unitPrice !== basePrice)
    ? unitPrice
    : undefined;

  return {
    catalogItemId: item.id,
    itemCode: item.item_code,
    quantity,
    ...(customPrice !== undefined ? { customPrice } : {}),
  };
};

const baseCanvasLineFor = (catalog: NormalizedPricingCatalogItem[]): QuoteCartLine[] => {
  const baseItem = catalog.find((item) => item.item_type === 'base_canvas');
  return baseItem ? [{ catalogItemId: baseItem.id, itemCode: baseItem.item_code, quantity: 1 }] : [];
};

const withoutRootCategoryLines = (catalog: NormalizedPricingCatalogItem[], cart: QuoteCartLine[]) =>
  cart.filter((line) => {
    const item = catalog.find((entry) => entry.id === line.catalogItemId);
    return item?.item_type !== 'base_canvas' && item?.item_type !== 'category_trigger';
  });

const withInfrastructureLines = (
  catalog: NormalizedPricingCatalogItem[],
  cart: QuoteCartLine[],
  infrastructure: InfrastructureState,
) => {
  const requiredCodes = new Set<string>();
  if (infrastructure.ownDomain) DOMAIN_INFRA_CODES.forEach((code) => requiredCodes.add(code));
  if (infrastructure.ownHosting) HOSTING_INFRA_CODES.forEach((code) => requiredCodes.add(code));

  const withoutInfrastructure = cart.filter((line) => {
    const item = catalog.find((entry) => entry.id === line.catalogItemId);
    return !item?.item_code || !INFRA_CODES.has(item.item_code);
  });
  const injectedLines = catalog
    .filter((item) => item.item_code ? requiredCodes.has(item.item_code) : false)
    .map((item) => ({ catalogItemId: item.id, itemCode: item.item_code, quantity: 1 }));

  return [...withoutInfrastructure, ...injectedLines];
};

const infrastructureSavingsFor = (infrastructure: InfrastructureState) => {
  if (infrastructure.ownDomain && infrastructure.ownHosting) {
    return { label: 'Ahorro neto por infraestructura propia: -S/ 150.00', netSavings: 150 };
  }
  if (infrastructure.ownDomain) {
    return { label: 'Ahorro neto (Dominio): -S/ 50.00', netSavings: 50 };
  }
  if (infrastructure.ownHosting) {
    return { label: 'Ahorro neto (Hosting): -S/ 100.00', netSavings: 100 };
  }
  return { label: '', netSavings: 0 };
};

export const computeQuoteTotals = (
  catalog: NormalizedPricingCatalogItem[],
  cart: QuoteCartLine[],
  infrastructure: InfrastructureState = { ownDomain: false, ownHosting: false },
): QuoteTotals => {
  const effectiveCart = withInfrastructureLines(catalog, cart, infrastructure);
  const baseItem = catalog.find((item) => item.item_type === 'base_canvas') ?? null;
  const cartWithItems = effectiveCart
    .map((line) => ({ line, item: catalog.find((entry) => entry.id === line.catalogItemId) }))
    .filter((entry): entry is { line: QuoteCartLine; item: NormalizedPricingCatalogItem } => Boolean(entry.item));

  const triggerLines = cartWithItems.filter(({ item }) => item.item_type === 'category_trigger');
  const activeTrigger = triggerLines.reduce<NormalizedPricingCatalogItem | null>((current, { item }) => {
    if (!current) return item;
    return moneyValue(item.base_price) > moneyValue(current.base_price) ? item : current;
  }, null);

  const adendaTrigger = cartWithItems.find(({ item }) => item.item_code?.startsWith('revision_'))?.item;
  const isAdendaMode = Boolean(adendaTrigger);

  const activeBaseSource = activeTrigger ?? adendaTrigger ?? baseItem;
  const projectCategory = activeTrigger?.upgrades_to_category || activeTrigger?.name || (isAdendaMode ? 'Adenda Adicional' : DEFAULT_PROJECT_CATEGORY);

  const visibleCartWithItems = cartWithItems.filter(({ item }) => {
    if (item.item_type === 'base_canvas') return !activeTrigger && !isAdendaMode;
    if (item.item_type === 'category_trigger') return activeTrigger?.id === item.id;
    return true;
  });

  const visibleLines = visibleCartWithItems.map(({ line, item }) => {
    const quantity = lineQuantity(item, line.quantity);
    const isActiveBaseTrigger = activeTrigger?.id === item.id;
    const freeIncludedQuantity = freeQuantityFor(item);
    const billableQuantity = billableQuantityFor(item, quantity);
    const customPrice = line.customPrice;
    const unitPrice = customPrice !== undefined && requiresCustomPrice(item)
      ? clampCustomPriceFor(item, customPrice).clampedPrice
      : moneyValue(item.base_price);
    const includedInBase = (
      item.item_type === 'base_included' ||
      (item.pricing_model === 'per_unit' && freeIncludedQuantity > 0 && billableQuantity === 0)
    );
    let subtotal = 0;

    if (item.item_type === 'base_canvas') {
      subtotal = activeTrigger ? 0 : moneyValue(item.base_price);
    } else if (item.item_type === 'category_trigger') {
      subtotal = isActiveBaseTrigger ? moneyValue(item.base_price) : 0;
    } else if (item.item_type === 'base_included') {
      subtotal = 0;
    } else if (customPrice !== undefined && requiresCustomPrice(item)) {
      subtotal = unitPrice * quantity;
    } else if (item.pricing_model === 'per_unit') {
      subtotal = billableQuantity * moneyValue(item.base_price);
    } else {
      subtotal = moneyValue(item.base_price) * quantity;
    }

    return { ...line, quantity, item, subtotal, billableQuantity, freeIncludedQuantity, unitPrice, includedInBase, isActiveBaseTrigger };
  });

  const additiveItems = visibleLines.filter(({ item }) => ['base_canvas', 'base_included', 'addon', 'category_trigger'].includes(item.item_type) && !isRecurring(item));
  const recurringItems = visibleLines.filter(({ item }) => isRecurring(item));

  const developmentTotal = additiveItems.reduce((sum, line) => sum + line.subtotal, 0);
  const recurringMonthlyTotal = recurringItems
    .filter(({ item }) => recurrenceFor(item) === 'monthly')
    .reduce((sum, line) => sum + line.subtotal, 0);
  const recurringYearlyTotal = recurringItems
    .filter(({ item }) => recurrenceFor(item) === 'yearly')
    .reduce((sum, line) => sum + line.subtotal, 0);

  const persistedLines = [...additiveItems, ...recurringItems].filter((line) => {
    if (line.item.item_type === 'category_trigger') return line.isActiveBaseTrigger;
    if (line.item.item_type === 'base_canvas') return !activeTrigger && !isAdendaMode;
    return true;
  });
  const additivePrepared = persistedLines.map(({ item, quantity, subtotal, unitPrice }) => preparedItem(item, quantity, unitPrice, subtotal));
  const cartItems = visibleLines.map(({ item, quantity, subtotal, unitPrice }) => ({
    ...preparedItem(item, quantity, unitPrice, subtotal),
    subtotal,
  }));

  return {
    title: `Cotización de Proyecto: ${projectCategory}`,
    projectCategory,
    baseItem,
    activeBaseSource,
    visibleLines,
    persistedItems: additivePrepared,
    cartItems,
    developmentTotal,
    recurringMonthlyTotal,
    recurringYearlyTotal,
    infrastructureSavings: infrastructureSavingsFor(infrastructure),
  };
};

export const useQuoterState = create<QuoterState>((set, get) => ({
  alertModal: null,
  setAlertModal: (alert) => set({ alertModal: alert }),
  catalog: [],
  cart: [],
  infrastructure: defaultInfrastructure(),
  editingQuoteId: null,
  setCatalog: (catalog) => set((state) => {
    const normalizedCatalog = normalizePricingCatalog(catalog);
    if (state.editingQuoteId) {
      return { catalog: normalizedCatalog };
    }
    return {
      catalog: normalizedCatalog,
      cart: defaultCartFor(normalizedCatalog),
      infrastructure: defaultInfrastructure(),
      editingQuoteId: null,
    };
  }),
  loadQuoteForEditing: (quoteData, itemsData) => set((state) => {
    const cart = itemsData
      .map((item) => cartLineFromEditableItem(state.catalog, item))
      .filter((line): line is QuoteCartLine => Boolean(line));
    const hasOwnDomain = itemsData.some((item) => item.item_code === 'discount_own_domain');
    const hasOwnHosting = itemsData.some((item) => item.item_code === 'discount_own_hosting');

    return {
      editingQuoteId: quoteData.id,
      cart: cart.length > 0 ? cart : defaultCartFor(state.catalog),
      infrastructure: {
        ownDomain: hasOwnDomain,
        ownHosting: hasOwnHosting,
      },
    };
  }),
  resetQuoter: () => set((state) => ({
    cart: defaultCartFor(state.catalog),
    infrastructure: defaultInfrastructure(),
    editingQuoteId: null,
  })),
  addItem: (catalogItemId) => set((state) => {
    const catalogItem = state.catalog.find((item) => item.id === catalogItemId);
    if (!catalogItem || !catalogItem.is_draggable || ['base_canvas', 'base_included'].includes(catalogItem.item_type)) return state;

    if (catalogItem.item_type === 'category_trigger') {
      return {
        cart: [
          cartLineFor(catalogItem),
          ...withoutRootCategoryLines(state.catalog, state.cart),
        ],
      };
    }

    const incomingRevision = revisionLevelFor(catalogItem);
    if (incomingRevision) {
      const existing = state.cart.find((line) => line.catalogItemId === catalogItemId);

      if (existing) {
        return {
          cart: state.cart.map((line) =>
            line.catalogItemId === catalogItemId ? { ...line, quantity: line.quantity + 1 } : line,
          ),
        };
      }

      const activeRevisions = state.cart
        .map((line) => state.catalog.find((item) => item.id === line.catalogItemId))
        .filter((item): item is NormalizedPricingCatalogItem => Boolean(item))
        .map((item) => ({ item, revision: revisionLevelFor(item) }))
        .filter((entry): entry is { item: NormalizedPricingCatalogItem; revision: { level: number } } => Boolean(entry.revision));
      const higherRevision = activeRevisions.find(({ revision }) => revision.level > incomingRevision.level);

      if (higherRevision) {
        showRevisionDowngradeWarning();
        return state;
      }

      return {
        cart: [cartLineFor(catalogItem)],
      };
    }

    const incomingMaintenance = maintenanceLevelFor(catalogItem);
    if (incomingMaintenance) {
      const activeMaintenances = state.cart
        .map((line) => state.catalog.find((item) => item.id === line.catalogItemId))
        .filter((item): item is NormalizedPricingCatalogItem => Boolean(item))
        .map((item) => ({ item, maintenance: maintenanceLevelFor(item) }))
        .filter((entry): entry is { item: NormalizedPricingCatalogItem; maintenance: { level: number; label: string } } => Boolean(entry.maintenance));
      const higherMaintenance = activeMaintenances.find(({ maintenance }) => maintenance.level > incomingMaintenance.level);

      if (higherMaintenance) {
        showMaintenanceDowngradeWarning(higherMaintenance.maintenance.label);
        return state;
      }

      return {
        cart: [
          ...state.cart.filter((line) => {
            const item = state.catalog.find((entry) => entry.id === line.catalogItemId);
            const maintenance = item ? maintenanceLevelFor(item) : null;
            return !maintenance || maintenance.level >= incomingMaintenance.level;
          }),
          ...(state.cart.some((line) => line.catalogItemId === catalogItemId) ? [] : [cartLineFor(catalogItem)]),
        ],
      };
    }

    const existing = state.cart.find((line) => line.catalogItemId === catalogItemId);
    if (existing) {
      if (catalogItem.pricing_model !== 'per_unit') return state;
      return {
        cart: state.cart.map((line) =>
          line.catalogItemId === catalogItemId ? { ...line, quantity: line.quantity + 1 } : line,
        ),
      };
    }

    return { cart: [...state.cart, cartLineFor(catalogItem)] };
  }),
  removeItem: (catalogItemId) => set((state) => {
    const removedItem = state.catalog.find((item) => item.id === catalogItemId);
    const nextCart = state.cart.filter((line) => line.catalogItemId !== catalogItemId);

    if (removedItem?.item_type === 'category_trigger') {
      return {
        cart: [
          ...baseCanvasLineFor(state.catalog),
          ...withoutRootCategoryLines(state.catalog, nextCart),
        ],
      };
    }

    if (removedItem && revisionLevelFor(removedItem)) {
      const hasOtherRevisions = nextCart.some((line) => {
        const item = state.catalog.find(i => i.id === line.catalogItemId);
        return item && revisionLevelFor(item);
      });
      if (!hasOtherRevisions) {
        const hasTrigger = nextCart.some((line) => state.catalog.find(i => i.id === line.catalogItemId)?.item_type === 'category_trigger');
        if (!hasTrigger) {
          const hasBaseCanvas = nextCart.some((line) => state.catalog.find(i => i.id === line.catalogItemId)?.item_type === 'base_canvas');
          return {
             cart: hasBaseCanvas ? nextCart : [
               ...defaultCartFor(state.catalog),
               ...nextCart
             ]
          };
        }
      }
    }

    return { cart: nextCart };
  }),
  updateQuantity: (catalogItemId, quantity) => set((state) => {
    const catalogItem = state.catalog.find((item) => item.id === catalogItemId);
    if (!catalogItem) return state;
    const normalizedQuantity = Math.max(1, Math.floor(quantity || 1));

    return {
      cart: state.cart.map((line) =>
        line.catalogItemId === catalogItemId
          ? { ...line, quantity: allowsMultipleQuantity(catalogItem) ? normalizedQuantity : 1 }
          : line,
      ),
    };
  }),
  setCustomPrice: (itemCode, price) => set((state) => ({
    cart: state.cart.map((line) => {
      const item = state.catalog.find((entry) => entry.id === line.catalogItemId);
      if (item?.item_code !== itemCode) return line;
      const customPrice = Number.isFinite(price) ? price : undefined;
      return customPrice === undefined ? { ...line, customPrice: undefined } : { ...line, customPrice };
    }),
  })),
  validateAndClampCustomPrice: (itemCode) => set((state) => {
    const clampWarnings: Array<{ basePrice: number; maxPrice: number | null }> = [];
    const cart = state.cart.map((line) => {
      const item = state.catalog.find((entry) => entry.id === line.catalogItemId);
      if (item?.item_code !== itemCode || !requiresCustomPrice(item)) return line;

      const { basePrice, maxPrice, clampedPrice, wasClamped } = clampCustomPriceFor(item, line.customPrice);
      if (wasClamped) {
        clampWarnings.push({ basePrice, maxPrice });
      }

      return { ...line, customPrice: clampedPrice };
    });

    const clampWarning = clampWarnings[0];
    if (clampWarning) {
      showCustomPriceClampWarning(clampWarning.basePrice, clampWarning.maxPrice);
    }

    return { cart };
  }),
  toggleOwnDomain: (enabled) => set((state) => {
    const infrastructure = { ...state.infrastructure, ownDomain: enabled };
    return { infrastructure, cart: withInfrastructureLines(state.catalog, state.cart, infrastructure) };
  }),
  toggleOwnHosting: (enabled) => set((state) => {
    const infrastructure = { ...state.infrastructure, ownHosting: enabled };
    return { infrastructure, cart: withInfrastructureLines(state.catalog, state.cart, infrastructure) };
  }),
  resetQuote: () => set((state) => ({
    cart: defaultCartFor(state.catalog),
    infrastructure: defaultInfrastructure(),
  })),
  totals: () => computeQuoteTotals(get().catalog, get().cart, get().infrastructure),
  buildPayload: () => {
    const infrastructure = get().infrastructure;
    const totals = computeQuoteTotals(get().catalog, get().cart, infrastructure);
    return {
      editingQuoteId: get().editingQuoteId,
      title: totals.title,
      projectCategory: totals.projectCategory,
      baseCatalogItemId: totals.activeBaseSource?.id ?? '',
      developmentTotal: totals.developmentTotal,
      recurringMonthlyTotal: totals.recurringMonthlyTotal,
      recurringYearlyTotal: totals.recurringYearlyTotal,
      grandTotalSnapshot: totals.developmentTotal + totals.recurringMonthlyTotal + totals.recurringYearlyTotal,
      infrastructure: {
        ...infrastructure,
        savingsLabel: totals.infrastructureSavings.label,
        netSavings: totals.infrastructureSavings.netSavings,
      },
      items: totals.persistedItems,
      cartItems: totals.cartItems,
      legalNotes: LEGAL_NOTES,
    };
  },
}));

export const quoteLegalNotes = LEGAL_NOTES;
export const formatPen = (value: number) => `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatCurrencyValue = (value: number, currencyCode?: string) => {
  const code = currencyCode || 'PEN';
  const symbol = code === 'USD' ? '$' : code === 'EUR' ? '€' : 'S/';
  return `${symbol} ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
