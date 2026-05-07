import { create } from 'zustand'

export const useMapStore = create((set) => ({
  activeLayers: {
    amenities: false,
    districts: true,
    movement: false,
  },
  selectedDistrict: null,
  selectedCategory: 'all',
  amenityData: [],
  isLoadingAmenities: false,

  toggleLayer: (layer) =>
    set((state) => ({
      activeLayers: {
        ...state.activeLayers,
        [layer]: !state.activeLayers[layer],
      },
    })),

  setSelectedDistrict: (district) => set({ selectedDistrict: district }),
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  setAmenityData: (data) => set({ amenityData: data }),
  setLoadingAmenities: (val) => set({ isLoadingAmenities: val }),
}))
