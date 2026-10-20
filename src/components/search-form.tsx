import { SearchIcon } from './icons';

export function SearchForm({ initialQuery = '' }: { initialQuery?: string }) {
  return (
    <form className="search-form" method="GET" action="/">
      <div className="search-input-wrapper">
        <label htmlFor="search-input" className="sr-only">ค้นหาคอนเสิร์ตหรือสถานที่</label>
        <SearchIcon className="search-input-icon" />
        <input
          id="search-input"
          type="search"
          name="q"
          defaultValue={initialQuery}
          placeholder="ค้นหาชื่องานคอนเสิร์ต หรือสถานที่..."
          aria-label="ค้นหาชื่องานคอนเสิร์ต"
        />
        <button type="submit" className="primary-button search-button">
          ค้นหา
        </button>
      </div>
    </form>
  );
}
