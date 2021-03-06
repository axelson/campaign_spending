require 'csv'
id = 1
CSV.open('_jekyll/data/campaign_spending_summary.csv', 'w',
         :write_headers => true,
         :headers => %w(expenditure_category election_period amount reg_no id)) do |output_csv|
           CSV.foreach("raw_data/expenditures.csv", :headers => true) do |row|
             #puts "on row #{row.inspect}"
             entry = {
               expenditure_category: row['Expenditure Category'].strip,
               election_period: row['Election Period'].strip,
               amount: row['sum_amount'].strip,
               reg_no: row['Reg No'].strip,
               id: id,
             }
             output_csv << entry.values
             id += 1
           end
         end

CSV.open('_jekyll/data/organizational_report.csv', 'w',
         :write_headers => true,
         :headers => %w(reg_no candidate_name office district county party)) do |output_csv|
           CSV.foreach("raw_data/organizational_reports.csv", :headers => true) do |row|
             # Skip Ronald, Strode since his data is bad
             next if row['Reg No'] == 'CC11033'
             if row['Party'].nil?
               puts "Skipping candidate with Reg No #{row['Reg No']} and name #{row['Candidate Name']} because missing party"
               next
             end
             entry = {
               reg_no: row['Reg No'].strip,
               candidate_name: row['Candidate Name'].strip,
               office: row['Office'].strip,
               district: row['District'] && row['District'].strip,
               county: row['County'] && row['County'].strip,
               party: row['Party'].strip
             }
             output_csv << entry.values
           end
         end
