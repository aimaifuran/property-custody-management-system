import { todayManila } from './formDates.js';

export function ptrItemFromAccountability(asset) {
  return {
    accountability: asset._id,
    inventory: asset.inventory?._id,
    property: asset.inventory?.property,
    serialNumber: asset.serialNumber || asset.inventory?.serialNumber || '',
    dateAcquired: asset.inventory?.purchaseDate ? String(asset.inventory.purchaseDate).slice(0, 10) : todayManila(),
    propertyNumber: asset.propertyNumber || asset.inventory?.propertyNumber || asset.inventory?.item?.stockNumber || '',
    description: asset.inventory?.item?.description || '',
    amount: Number(asset.quantityRemaining || 0) * Number(asset.inventory?.unitCost || 0),
    condition: asset.condition || 'Serviceable',
  };
}

export function getPtrIssuedAssets(assets) {
  return assets.filter(asset => asset.user && asset.inventory?.item && asset.acceptedAt && !asset.pendingMovement && Number(asset.quantityRemaining) > 0);
}

const idOf = value => String(value?._id || value || '');

export function getAccountableOwner(asset, people) {
  const userId = idOf(asset.user);
  const person = people.find(candidate => idOf(candidate) === userId);
  return {
    userId,
    name: person?.name || asset.employee || '',
  };
}

export function matchSourceRowsToAccountabilities(sourceRows, accountabilities) {
  const available = accountabilities.filter(asset =>
    asset.active !== false &&
    asset.deleted !== true &&
    asset.user &&
    Number(asset.quantityRemaining ?? Number(asset.quantity || 0) - Number(asset.returnedQuantity || 0)) > 0
  );
  return sourceRows.map(source => {
    const inventoryIds = [source.inventory, ...(source.inventories || [])].map(idOf).filter(Boolean);
    if (inventoryIds.length) {
      const byInventory = available.filter(asset => inventoryIds.includes(idOf(asset.inventory)));
      if (byInventory.length) return byInventory;
    }

    const serialNumbers = [source.serialNumber, ...(source.serialNumbers || [])].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
    if (serialNumbers.length) {
      const bySerial = available.filter(asset =>
        serialNumbers.includes(String(asset.serialNumber || asset.inventory?.serialNumber || '').trim().toLowerCase())
      );
      if (bySerial.length) return bySerial;
    }

    const propertyNumbers = [source.propertyNumber, source.stockPropertyNumber].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
    if (propertyNumbers.length) {
      const byPropertyNumber = available.filter(asset =>
        propertyNumbers.includes(String(asset.propertyNumber || asset.inventory?.propertyNumber || '').trim().toLowerCase())
      );
      if (byPropertyNumber.length) return byPropertyNumber;
    }

    const stockNumbers = [source.stockNumber, source.stockPropertyNumber].map(value => String(value || '').trim().toLowerCase()).filter(Boolean);
    if (stockNumbers.length) {
      const byStockNumber = available.filter(asset =>
        stockNumbers.includes(String(asset.inventory?.item?.stockNumber || asset.inventory?.item?.displayStockNumber || '').trim().toLowerCase())
      );
      if (byStockNumber.length) return byStockNumber;
    }

    const sourceName = String(source.propertyPlantAndEquipment || source.item || '').trim().toLowerCase();
    const sourceDescription = String(source.description || '').trim().toLowerCase();
    if (sourceName || sourceDescription) {
      return available.filter(asset => {
        const item = asset.inventory?.item;
        const names = [item?.name, item?.category !== 'General' ? item?.category : ''].map(value => String(value || '').trim().toLowerCase());
        const descriptions = [item?.description].map(value => String(value || '').trim().toLowerCase());
        return (sourceName && names.includes(sourceName)) || (sourceDescription && descriptions.includes(sourceDescription));
      });
    }
    return [];
  });
}

export function getIssuedSourceRows(sourceRows, accountabilities) {
  const matches = matchSourceRowsToAccountabilities(sourceRows, accountabilities);
  return sourceRows.filter((_, index) => matches[index].length > 0);
}
