/** Allocation persistence — routes import via this module, not repositories/. */
export {
  allocationWithServerInclude,
  createAllocation,
  deleteAllocation,
  findAllocation,
  findFirstAllocation,
  findManyAllocations,
  promotePrimaryAllocationTransaction,
  updateAllocation,
  updateManyAllocations,
  type Allocation,
  type AllocationWithServerName,
} from "../repositories/allocations.js";
