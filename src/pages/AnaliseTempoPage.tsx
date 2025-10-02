"use client";

// ... imports ...

// Mudar estado:
const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
  from: subDays(new Date(), 7),
  to: new Date()
});

// No DateRangePicker:
const DateRangePicker = ({ dateRange, onChange }: { 
  dateRange: { from: Date | undefined; to: Date | undefined }; 
  onChange: (range: { from: Date | undefined; to: Date | undefined }) => void 
}) => {
  const { t } = useTranslation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateRange.from?.toLocaleDateString() ?? t("startDate")} - {dateRange.to?.toLocaleDateString() ?? t("endDate")}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          selected={dateRange}
          onSelect={onChange}
          numberOfMonths={2}
          toDate={new Date()}
          fromDate={subDays(new Date(), 365)}
        />
      </PopoverContent>
    </Popover>
  );
};

// No queryFn, ajustar startDate e endDate:
const startDate = startOfDay(dateRange.from || new Date());
const endDate = endOfDay(dateRange.to || new Date());

// No JSX:
<DateRangePicker dateRange={dateRange} onChange={setDateRange} />

// ... resto inalterado